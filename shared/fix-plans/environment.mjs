import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { resolveInside } from '../conventions/read-inside.mjs';

function inside(root, name) {
  const base = path.resolve(root);
  return path.resolve(base, name) === base ? base : resolveInside(root, name);
}

function kindOf(full) {
  if (full === undefined || !existsSync(full)) {
    return 'none';
  }
  return statSync(full).isDirectory() ? 'directory' : 'file';
}

export function projectEnvironment(root) {
  return {
    read(name) {
      const full = inside(root, name);
      return kindOf(full) === 'file' ? readFileSync(full, 'utf8') : undefined;
    },
    exists(name) {
      return kindOf(inside(root, name)) === 'file';
    },
    list(name) {
      const full = inside(root, name);
      return kindOf(full) === 'directory' ? readdirSync(full).toSorted() : [];
    },
  };
}

export const NO_FILES = Object.freeze({
  read: () => undefined,
  exists: () => false,
  list: () => [],
});
