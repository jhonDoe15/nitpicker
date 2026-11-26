import { statSync } from 'node:fs';
import path from 'node:path';
import { chainOf } from '../traversal.mts';
import { byText } from '../text-order/by-text.mts';
import type { TreeListing, TreeSources } from './project-files-types.mts';
import { seededTree } from './seeded/seeded-trees.mts';

const COARSE_RACY_WINDOW_MS = 1000;
const FINE_RACY_WINDOW_MS = 50;
const WHOLE_SECOND_MS = 1000;
const MAX_RELISTED_FOLDERS = 64;
const IGNORE_FILE = '.gitignore';
const ROOT_DIRECTORY = '.';

type Stamped = {
  readonly tree: TreeListing;
  readonly folders: string[];
  readonly paths: string[];
  readonly times: number[];
  readonly stampedAt: number;
};

const trees = new Map<string, Stamped>();

function foldersOf(files: readonly string[]): string[] {
  const parents = new Set(files.map((file) => path.posix.dirname(file)));
  const chains = [...parents].flatMap((parent) =>
    chainOf(parent, (current: string) =>
      current === ROOT_DIRECTORY ? undefined : path.posix.dirname(current),
    ),
  );
  return [...new Set([ROOT_DIRECTORY, ...chains])];
}

function absoluteOf(top: string, relative: string): string {
  return path.join(top, ...relative.split('/'));
}

function timeOf(file: string): number {
  return statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? -1;
}

function isRacy(time: number, stampedAt: number): boolean {
  const window = time % WHOLE_SECOND_MS === 0 ? COARSE_RACY_WINDOW_MS : FINE_RACY_WINDOW_MS;
  return time >= stampedAt - window;
}

function stamped(
  top: string,
  tree: TreeListing,
  known: ReadonlyMap<string, number> = new Map<string, number>(),
): Stamped {
  const folders = foldersOf(tree.files);
  const ignoreFiles = tree.files.filter((file) => path.posix.basename(file) === IGNORE_FILE);
  const paths = [
    ...[...folders, ...ignoreFiles].map((relative) => absoluteOf(top, relative)),
    ...tree.gitPaths,
  ];
  const times = paths.map((file) => known.get(file) ?? timeOf(file));
  return { tree, folders, paths, times, stampedAt: Date.now() };
}

function changedIndexes(entry: Stamped, now: readonly number[]): number[] {
  return now.flatMap((time, index) =>
    time === entry.times[index] && !isRacy(time, entry.stampedAt) ? [] : [index],
  );
}

function outermost(folders: readonly string[]): string[] {
  const sorted = [...new Set(folders)].toSorted(byText);
  return sorted.filter(
    (folder) => !sorted.some((other) => other !== folder && folder.startsWith(`${other}/`)),
  );
}

function touchesSubmodule(top: string, tree: TreeListing, folders: readonly string[]): boolean {
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

function patched(
  { top, tree, relist }: { top: string; tree: TreeListing; relist: TreeSources['relist'] },
  folders: readonly string[],
): TreeListing | undefined {
  const relisted = folders.map((folder) => relist(top, folder));
  const listed = relisted.filter((found) => found !== undefined);
  if (listed.length !== relisted.length) {
    return undefined;
  }
  const prefixes = folders.map((folder) => `${folder}/`);
  function outside(file: string): boolean {
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

function refreshed(
  top: string,
  entry: Stamped,
  relist: TreeSources['relist'],
): Stamped | undefined {
  const now = entry.paths.map(timeOf);
  const changed = changedIndexes(entry, now);
  if (changed.length === 0) {
    return entry;
  }
  if (changed.some((index) => index >= entry.folders.length)) {
    return undefined;
  }
  const folders = outermost(changed.flatMap((index) => entry.folders[index] ?? []));
  if (
    folders.includes(ROOT_DIRECTORY) ||
    folders.length > MAX_RELISTED_FOLDERS ||
    touchesSubmodule(top, entry.tree, folders)
  ) {
    return undefined;
  }
  const tree = patched({ top, tree: entry.tree, relist }, folders);
  const prefixes = folders.map((folder) => `${absoluteOf(top, folder)}${path.sep}`);
  const known = new Map<string, number>(
    entry.paths
      .flatMap((file, index) => (now[index] === undefined ? [] : [[file, now[index]] as const]))
      .filter(([file]) => !prefixes.some((prefix) => `${file}${path.sep}`.startsWith(prefix))),
  );
  return tree === undefined ? undefined : stamped(top, tree, known);
}

function cachedIn(
  memory: Map<string, Stamped>,
  top: string,
  { load, relist }: TreeSources,
): TreeListing | undefined {
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

export function cachedTree(top: string, sources: TreeSources): TreeListing | undefined {
  return seededTree(top) ?? cachedIn(trees, top, sources);
}
