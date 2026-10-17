import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { commitSource } from './sources.mjs';

const MAX_STYLE_FILES = 1000;
const PROJECT_STYLE_FILE =
  /^(?:[^/]+|(?:gradle|requirements)\/[^/]+|config\/.+|.+\.(?:toml|ya?ml))$/u;

function isStyleFile(file, project) {
  if (project === '' || file.startsWith(`${project}/`)) {
    return PROJECT_STYLE_FILE.test(project === '' ? file : file.slice(project.length + 1));
  }
  const directory = path.posix.dirname(file);
  return directory === '.' || project.startsWith(`${directory}/`);
}

function contained(directory, relative) {
  const full = path.resolve(directory, relative);
  return full === directory || full.startsWith(directory + path.sep) ? full : undefined;
}

function writeSnapshot(directory, source, files) {
  for (const [file, text] of source.readMany(files)) {
    const target = contained(directory, file);
    if (target !== undefined) {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, text);
    }
  }
}

function materializedRoot({ repositoryRoot, commitSha, projectRoot }) {
  const project = path.relative(repositoryRoot, projectRoot).split(path.sep).join('/');
  const source = commitSource({ repositoryRoot, commitSha, projectRoot: repositoryRoot });
  const files = source
    .paths()
    .filter((file) => isStyleFile(file, project))
    .sort()
    .slice(0, MAX_STYLE_FILES);
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-style-'));
  const projectPath = contained(directory, project) ?? directory;
  mkdirSync(path.join(directory, '.git'));
  mkdirSync(projectPath, { recursive: true });
  writeSnapshot(directory, source, files);
  return {
    path: projectPath,
    snapshot: 'base',
    dispose: () => {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

export function lazyConfigRoot({ projectRoot, commit, useBase }) {
  const made = [];
  function create() {
    return commit !== undefined && useBase()
      ? materializedRoot({ ...commit(), projectRoot })
      : { path: projectRoot, snapshot: 'head', dispose: () => undefined };
  }
  return {
    get: () => {
      if (made.length === 0) {
        made.push(create());
      }
      return made[0];
    },
    dispose: () => {
      for (const root of made) {
        root.dispose();
      }
    },
  };
}
