import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'coverage', '.stryker-tmp']);

/**
 * A tree is a Map from posix relative path to file text. Detectors take trees so tests can use
 * tiny object literals; `toTree` accepts either a Map or a plain object.
 */
export function toTree(treeLike) {
  return treeLike instanceof Map ? treeLike : new Map(Object.entries(treeLike));
}

export function loadTree(directory) {
  const tree = new Map();
  const walk = (relative) => {
    for (const entry of readdirSync(path.join(directory, relative), {
      withFileTypes: true,
    })) {
      const entryPath = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) {
          walk(entryPath);
        }
      } else if (entry.isFile()) {
        tree.set(entryPath, readFileSync(path.join(directory, entryPath), 'utf8'));
      }
    }
  };
  walk('');
  return tree;
}

export function diffTrees(fixtureLike, finalLike) {
  const fixture = toTree(fixtureLike);
  const final = toTree(finalLike);
  const added = [];
  const removed = [];
  const modified = [];
  for (const [file, text] of final) {
    if (!fixture.has(file)) {
      added.push(file);
    } else if (fixture.get(file) !== text) {
      modified.push(file);
    }
  }
  for (const file of fixture.keys()) {
    if (!final.has(file)) {
      removed.push(file);
    }
  }
  return {
    added: added.sort(),
    removed: removed.sort(),
    modified: modified.sort(),
  };
}
