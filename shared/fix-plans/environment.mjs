import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { resolveInside } from '../conventions/read-inside.mjs';

function inside(root, name) {
  const base = path.resolve(root);
  return path.resolve(base, name) === base ? base : resolveInside(root, name);
}

const DIRECTORY = 'directory';

function kindOf(full) {
  if (full === undefined || !existsSync(full)) {
    return 'none';
  }
  return statSync(full).isDirectory() ? DIRECTORY : 'file';
}

const SKIPPED_ANYWHERE = new Set([
  'node_modules',
  '.git',
  '.venv',
  'venv',
  '__pycache__',
  '.gradle',
]);
const SKIPPED_AT_ROOT = new Set([
  'build',
  'dist',
  'out',
  'target',
  'coverage',
  'reports',
  '.stryker-tmp',
]);
const TEST_FOLDER = /^(?:tests?|specs?|__tests__)$/u;
const FILE_LIMIT = 50000;

function compareNames(a, b) {
  const first = TEST_FOLDER.test(a.name) ? 0 : 1;
  const second = TEST_FOLDER.test(b.name) ? 0 : 1;
  if (first !== second) {
    return first - second;
  }
  return a.name < b.name ? -1 : Number(a.name > b.name);
}

function skipped(folder, name) {
  return SKIPPED_ANYWHERE.has(name) || (folder === '' && SKIPPED_AT_ROOT.has(name));
}

function childrenOf(base, folder) {
  const full = inside(base, folder);
  if (full === undefined || kindOf(full) !== DIRECTORY) {
    return [];
  }
  return readdirSync(full, { withFileTypes: true })
    .toSorted(compareNames)
    .map((entry) => ({
      name: folder === '' ? entry.name : `${folder}/${entry.name}`,
      entry,
      folder,
    }));
}

function walk(base) {
  const found = [];
  const pending = childrenOf(base, '');
  for (const { name, entry, folder } of pending) {
    if (found.length >= FILE_LIMIT) {
      break;
    }
    if (entry.isDirectory() && !skipped(folder, entry.name)) {
      pending.push(...childrenOf(base, name));
    } else if (entry.isFile()) {
      found.push(name);
    }
  }
  return found;
}

export function projectEnvironment(root) {
  return {
    files() {
      return walk(path.resolve(root));
    },
    read(name) {
      const full = inside(root, name);
      return kindOf(full) === 'file' ? readFileSync(full, 'utf8') : undefined;
    },
    exists(name) {
      return kindOf(inside(root, name)) === 'file';
    },
    list(name) {
      const full = inside(root, name);
      return kindOf(full) === DIRECTORY ? readdirSync(full).toSorted() : [];
    },
  };
}

export const NO_FILES = Object.freeze({
  files: () => [],
  read: () => undefined,
  exists: () => false,
  list: () => [],
});
