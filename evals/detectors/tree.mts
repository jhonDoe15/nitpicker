import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Tree, TreeLike } from './common/types.mts';
import { BUILD_ROOT_FILES } from './languages/project-files.mts';

const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.stryker-tmp',
  '.venv',
  '__pycache__',
  '.pytest_cache',
  '.ruff_cache',
  '.mypy_cache',
  'mutants',
  '.gradle',
  '.kotlin',
]);
const BUILD_OUTPUT = new Set(['build', 'target']);

export function toTree(treeLike: TreeLike): Tree {
  return treeLike instanceof Map ? treeLike : new Map(Object.entries(treeLike));
}

export function loadTree(directory: string): Map<string, string> {
  const tree = new Map<string, string>();
  function walk(relative: string): void {
    const entries = readdirSync(path.join(directory, relative), { withFileTypes: true });
    const isBuildRoot = entries.some((entry) => BUILD_ROOT_FILES.has(entry.name));
    for (const entry of entries) {
      const entryPath = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) {
        const skipped =
          SKIPPED_DIRECTORIES.has(entry.name) || (isBuildRoot && BUILD_OUTPUT.has(entry.name));
        if (!skipped) {
          walk(entryPath);
        }
      } else if (entry.isFile()) {
        tree.set(entryPath, readFileSync(path.join(directory, entryPath), 'utf8'));
      }
    }
  }
  walk('');
  return tree;
}

export type TreeChanges = { added: string[]; removed: string[]; modified: string[] };

export function diffTrees(fixtureLike: TreeLike, finalLike: TreeLike): TreeChanges {
  const fixture = toTree(fixtureLike);
  const final = toTree(finalLike);
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
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
