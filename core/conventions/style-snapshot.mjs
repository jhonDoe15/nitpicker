import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { commitSource } from './sources.mjs';
import { explainedError } from '../../shared/messages/troubleshooting.mjs';

const MAX_STYLE_FILES = 1000;
const MAX_NAME_BYTES = 255;
const ANCESTOR_FILE = /^(?:\.ruff\.toml|ruff\.toml|pyproject\.toml|setup\.cfg|\.editorconfig)$/u;
const PROJECT_FILE = new RegExp(
  [
    String.raw`\.ruff\.toml`,
    String.raw`ruff\.toml`,
    String.raw`pyproject\.toml`,
    String.raw`setup\.cfg`,
    String.raw`tox\.ini`,
    String.raw`pytest\.ini`,
    'Pipfile',
    String.raw`\.pre-commit-config\.yaml`,
    String.raw`requirements[^/]*\.(?:txt|in)`,
    String.raw`requirements/[^/]+\.(?:txt|in)`,
    String.raw`\.editorconfig`,
    String.raw`(?:build|settings)\.gradle(?:\.kts)?`,
    String.raw`gradle/libs\.versions\.toml`,
    String.raw`detekt[^/]*\.ya?ml`,
    String.raw`config/detekt[^/]*\.ya?ml`,
    String.raw`config/detekt/[^/]+\.ya?ml`,
  ].join('|'),
  'u',
);
const EXTEND = /^\s*extend\s*=\s*["']([^"']+)["']/mu;
const RESERVED_NAME = /^(?:con|prn|aux|nul|com\d|lpt\d)(?:\..*)?$/iu;

function isStyleFile(file, project, named) {
  if (named.includes(file)) {
    return true;
  }
  const inside = project === '' || file.startsWith(`${project}/`);
  if (inside) {
    const relative = project === '' ? file : file.slice(project.length + 1);
    return PROJECT_FILE.test(relative) || path.posix.basename(relative) === '.editorconfig';
  }
  const directory = path.posix.dirname(file);
  return (
    ANCESTOR_FILE.test(path.posix.basename(file)) &&
    (directory === '.' || project.startsWith(`${directory}/`))
  );
}

function byDepth(left, right) {
  return left.split('/').length - right.split('/').length || left.localeCompare(right);
}

function selectedFiles(source, project, named) {
  const files = source
    .paths()
    .filter((file) => isStyleFile(file, project, named))
    .toSorted(byDepth);
  if (files.length > MAX_STYLE_FILES) {
    throw explainedError(
      `Found ${String(files.length)} style files under ${project === '' ? 'the repository' : project}, more than the ${String(MAX_STYLE_FILES)} that nitpicker copies from the merge base: run it from a narrower project folder`,
    );
  }
  return files;
}

function extendedFiles(file, text) {
  const target = EXTEND.exec(text)?.[1];
  return target === undefined || !file.endsWith('.toml')
    ? []
    : [path.posix.join(path.posix.dirname(file), target)];
}

function readExtension(source, read, file) {
  const text = read.has(file) ? undefined : source.readMany([file]).get(file);
  if (text === undefined) {
    return [];
  }
  read.set(file, text);
  return extendedFiles(file, text);
}

function withExtended(source, files) {
  const read = source.readMany(files);
  const queue = [...read].flatMap(([file, text]) => extendedFiles(file, text));
  for (const file of queue) {
    queue.push(...readExtension(source, read, file));
  }
  return read;
}

function unwritableReason(file) {
  const parts = file.split('/');
  if (parts.some((part) => Buffer.byteLength(part) > MAX_NAME_BYTES)) {
    return 'a name is too long';
  }
  if (parts.some((part) => part.includes(':'))) {
    return "a name contains ':'";
  }
  return parts.some((part) => RESERVED_NAME.test(part)) ? 'a name is reserved' : undefined;
}

function contained(directory, relative) {
  const full = path.resolve(directory, relative);
  if (full !== directory && !full.startsWith(directory + path.sep)) {
    throw new Error(`The style file ${relative} points outside the copy of the merge base`);
  }
  return full;
}

function writeOne(directory, file, text) {
  const target = contained(directory, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text);
}

function writeGuarded(directory, file, text) {
  const reason = unwritableReason(file);
  if (reason !== undefined) {
    return `${file}: ${reason}`;
  }
  try {
    writeOne(directory, file, text);
    return undefined;
  } catch (error) {
    if (error.code === undefined) {
      throw error;
    }
    return `${file}: ${error.code}`;
  }
}

function writeSnapshot(directory, texts) {
  return [...texts]
    .map(([file, text]) => writeGuarded(directory, file, text))
    .filter((note) => note !== undefined);
}

function materializedRoot({ repositoryRoot, commitSha, projectRoot, named }) {
  const project = path.relative(repositoryRoot, projectRoot).replaceAll(path.sep, '/');
  const source = commitSource({ repositoryRoot, commitSha, projectRoot: repositoryRoot });
  const inProject = named.map((file) => (project === '' ? file : `${project}/${file}`));
  const texts = withExtended(source, selectedFiles(source, project, inProject));
  const directory = mkdtempSync(path.join(path.resolve(tmpdir()), 'nitpicker-style-'));
  function dispose() {
    rmSync(directory, { recursive: true, force: true });
  }
  try {
    mkdirSync(path.join(directory, '.git'));
    const projectPath = contained(directory, project);
    mkdirSync(projectPath, { recursive: true });
    const notes = writeSnapshot(directory, texts);
    return { path: projectPath, snapshot: 'base', dispose, notes };
  } catch (error) {
    dispose();
    throw error;
  }
}

export function lazyConfigRoot({ projectRoot, commit, useBase, named = [] }) {
  const made = [];
  function create() {
    return commit !== undefined && useBase()
      ? materializedRoot({ ...commit(), projectRoot, named })
      : { path: projectRoot, snapshot: 'head', dispose: () => undefined, notes: [] };
  }
  return {
    get: () => {
      if (made.length === 0) {
        made.push(create());
      }
      return made[0];
    },
    notes: () => {
      const skipped = made.flatMap((root) => root.notes);
      return skipped.length === 0
        ? []
        : [`Could not copy these style files from the merge base: ${skipped.join(', ')}`];
    },
    dispose: () => {
      for (const root of made) {
        root.dispose();
      }
    },
  };
}
