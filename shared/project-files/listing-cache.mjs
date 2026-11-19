import { statSync } from 'node:fs';
import path from 'node:path';
import { chainOf } from '../traversal.mjs';
import { byText } from '../text-order/by-text.mjs';

const COARSE_RACY_WINDOW_MS = 1000;
const FINE_RACY_WINDOW_MS = 50;
const WHOLE_SECOND_MS = 1000;
const MAX_RELISTED_FOLDERS = 64;
const IGNORE_FILE = '.gitignore';
const ROOT_DIRECTORY = '.';

const trees = new Map();

function foldersOf(files) {
  const parents = new Set(files.map((file) => path.posix.dirname(file)));
  const chains = [...parents].flatMap((parent) =>
    chainOf(parent, (current) =>
      current === ROOT_DIRECTORY ? undefined : path.posix.dirname(current),
    ),
  );
  return [...new Set([ROOT_DIRECTORY, ...chains])];
}

function absoluteOf(top, relative) {
  return path.join(top, ...relative.split('/'));
}

function timeOf(file) {
  return statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? -1;
}

function isRacy(time, stampedAt) {
  const window = time % WHOLE_SECOND_MS === 0 ? COARSE_RACY_WINDOW_MS : FINE_RACY_WINDOW_MS;
  return time >= stampedAt - window;
}

function stamped(top, tree, known = new Map()) {
  const folders = foldersOf(tree.files);
  const ignoreFiles = tree.files.filter((file) => path.posix.basename(file) === IGNORE_FILE);
  const paths = [
    ...[...folders, ...ignoreFiles].map((relative) => absoluteOf(top, relative)),
    ...tree.gitPaths,
  ];
  const times = paths.map((file) => known.get(file) ?? timeOf(file));
  return { tree, folders, paths, times, stampedAt: Date.now() };
}

function changedIndexes(entry, now) {
  return now.flatMap((time, index) =>
    time === entry.times[index] && !isRacy(time, entry.stampedAt) ? [] : [index],
  );
}

function outermost(folders) {
  const sorted = [...new Set(folders)].toSorted(byText);
  return sorted.filter(
    (folder) => !sorted.some((other) => other !== folder && folder.startsWith(`${other}/`)),
  );
}

function touchesSubmodule(top, tree, folders) {
  return folders.some((folder) => {
    const absolute = absoluteOf(top, folder);
    return [...tree.submodules].some(
      (submodule) =>
        submodule === absolute ||
        submodule.startsWith(`${absolute}${path.sep}`) ||
        absolute.startsWith(`${submodule}${path.sep}`),
    );
  });
}

function patched({ top, tree, relist }, folders) {
  const listed = folders.map((folder) => relist(top, folder));
  if (listed.includes(undefined)) {
    return undefined;
  }
  const prefixes = folders.map((folder) => `${folder}/`);
  function outside(file) {
    return !prefixes.some((prefix) => file.startsWith(prefix));
  }
  const entries = listed.flat();
  return {
    ...tree,
    files: [...tree.files.filter(outside), ...entries.map(({ file }) => file)].toSorted(byText),
    links: new Set([
      ...[...tree.links].filter(outside),
      ...entries.filter(({ kind }) => kind === 'link').map(({ file }) => file),
    ]),
  };
}

function refreshed(top, entry, relist) {
  const now = entry.paths.map(timeOf);
  const changed = changedIndexes(entry, now);
  if (changed.length === 0) {
    return entry;
  }
  if (changed.some((index) => index >= entry.folders.length)) {
    return undefined;
  }
  const folders = outermost(changed.map((index) => entry.folders[index]));
  if (
    folders.includes(ROOT_DIRECTORY) ||
    folders.length > MAX_RELISTED_FOLDERS ||
    touchesSubmodule(top, entry.tree, folders)
  ) {
    return undefined;
  }
  const tree = patched({ top, tree: entry.tree, relist }, folders);
  const prefixes = folders.map((folder) => `${absoluteOf(top, folder)}${path.sep}`);
  const known = new Map(
    entry.paths
      .map((file, index) => [file, now[index]])
      .filter(([file]) => !prefixes.some((prefix) => `${file}${path.sep}`.startsWith(prefix))),
  );
  return tree === undefined ? undefined : stamped(top, tree, known);
}

function cachedIn(memory, top, { load, relist }) {
  const previous = memory.get(top);
  const kept = previous === undefined ? undefined : refreshed(top, previous, relist);
  if (kept !== undefined) {
    memory.set(top, kept);
    return kept.tree;
  }
  const tree = load(top);
  if (tree === undefined) {
    memory.delete(top);
    return undefined;
  }
  memory.set(top, stamped(top, tree));
  return tree;
}

export function cachedTree(top, sources) {
  return cachedIn(trees, top, sources);
}
