import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BUILD_ROOT_FILES } from './languages/project-files.mjs';

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
// `build` and `target` are Gradle and Maven output only beside the build file; elsewhere they can
// be a package of the project.
const BUILD_OUTPUT = new Set(['build', 'target']);

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
