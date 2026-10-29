import { statSync } from 'node:fs';
import path from 'node:path';
import { chainOf } from '../traversal.mjs';
import { stampedValue } from './stamped-cache.mjs';

const RACY_WINDOW_MS = 1000;
const IGNORE_FILE = '.gitignore';
const ROOT_DIRECTORY = '.';

const trees = new Map();

function directoriesOf(files) {
  const parents = new Set(files.map((file) => path.posix.dirname(file)));
  const chains = [...parents].flatMap((parent) =>
    chainOf(parent, (current) =>
      current === ROOT_DIRECTORY ? undefined : path.posix.dirname(current),
    ),
  );
  return new Set(chains);
}

function watchedPaths(top, tree) {
  const ignoreFiles = tree.files.filter((file) => path.posix.basename(file) === IGNORE_FILE);
  return [
    ...[...directoriesOf(tree.files), ...ignoreFiles].map((relative) =>
      path.join(top, ...relative.split('/')),
    ),
    ...tree.gitPaths,
  ];
}

function stampOf(watched) {
  const times = watched.map((file) => statSync(file, { throwIfNoEntry: false })?.mtimeMs);
  const newest = times.reduce((latest, time) => Math.max(latest, time ?? 0), 0);
  return { text: times.join(','), newest };
}

export function cachedTree(top, load) {
  return stampedValue(trees, top, {
    stampOf,
    load: (directory) => {
      const tree = load(directory);
      return tree === undefined
        ? undefined
        : { value: tree, watched: watchedPaths(directory, tree) };
    },
    isFresh: (newest) => Date.now() - newest > RACY_WINDOW_MS,
  });
}
