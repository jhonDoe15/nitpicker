import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { commitSource } from './sources.mts';
import { fieldOf, textOf } from '../../shared/values/readers.mts';
import type {
  CommitRef,
  ConfigRoot,
  ConventionSource,
  LazyConfigRoot,
} from './typed/convention-types.mts';
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

function isStyleFile(file: string, project: string, named: readonly string[]): boolean {
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

function byDepth(left: string, right: string): number {
  return left.split('/').length - right.split('/').length || left.localeCompare(right);
}

function selectedFiles(
  source: ConventionSource,
  project: string,
  named: readonly string[],
): string[] {
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

function extendedFiles(file: string, text: string): string[] {
  const target = EXTEND.exec(text)?.[1];
  return target === undefined || !file.endsWith('.toml')
    ? []
    : [path.posix.join(path.posix.dirname(file), target)];
}

function readExtension(
  source: ConventionSource,
  read: Map<string, string>,
  file: string,
): string[] {
  const text = read.has(file) ? undefined : source.readMany([file]).get(file);
  if (text === undefined) {
    return [];
  }
  read.set(file, text);
  return extendedFiles(file, text);
}

function withExtended(source: ConventionSource, files: readonly string[]): Map<string, string> {
  const read = source.readMany(files);
  const queue = [...read].flatMap(([file, text]) => extendedFiles(file, text));
  for (const file of queue) {
    queue.push(...readExtension(source, read, file));
  }
  return read;
}

function unwritableReason(file: string): string | undefined {
  const parts = file.split('/');
  if (parts.some((part) => Buffer.byteLength(part) > MAX_NAME_BYTES)) {
    return 'a name is too long';
  }
  if (parts.some((part) => part.includes(':'))) {
    return "a name contains ':'";
  }
  return parts.some((part) => RESERVED_NAME.test(part)) ? 'a name is reserved' : undefined;
}

function contained(directory: string, relative: string): string {
  const full = path.resolve(directory, relative);
  if (full !== directory && !full.startsWith(directory + path.sep)) {
    throw new Error(`The style file ${relative} points outside the copy of the merge base`);
  }
  return full;
}

function writeOne(directory: string, file: string, text: string): void {
  const target = contained(directory, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text);
}

function writeGuarded(directory: string, file: string, text: string): string | undefined {
  const reason = unwritableReason(file);
  if (reason !== undefined) {
    return `${file}: ${reason}`;
  }
  try {
    writeOne(directory, file, text);
    return undefined;
  } catch (error) {
    const code = fieldOf(error, 'code');
    if (code === undefined) {
      throw error;
    }
    return `${file}: ${textOf(code)}`;
  }
}

function writeSnapshot(directory: string, texts: ReadonlyMap<string, string>): string[] {
  return [...texts].flatMap(([file, text]) => {
    const note = writeGuarded(directory, file, text);
    return note === undefined ? [] : [note];
  });
}

function materializedRoot({
  repositoryRoot,
  commitSha,
  projectRoot,
  named,
}: CommitRef & { readonly projectRoot: string; readonly named: readonly string[] }): ConfigRoot {
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

export function lazyConfigRoot({
  projectRoot,
  commit,
  useBase,
  named = [],
}: {
  readonly projectRoot: string;
  readonly commit: (() => CommitRef) | undefined;
  readonly useBase: () => boolean;
  readonly named?: readonly string[];
}): LazyConfigRoot {
  const made: ConfigRoot[] = [];
  function create(): ConfigRoot {
    return commit !== undefined && useBase()
      ? materializedRoot({ ...commit(), projectRoot, named })
      : { path: projectRoot, snapshot: 'head', dispose: () => undefined, notes: [] };
  }
  return {
    get: () => {
      const existing = made[0] ?? create();
      if (made.length === 0) {
        made.push(existing);
      }
      return existing;
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
