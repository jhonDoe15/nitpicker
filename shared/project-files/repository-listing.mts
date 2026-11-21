import { existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { neutralGit } from './git-command.mts';
import { hasRepositoryMarker, inheritedRule, posixRelative } from './tree-walk.mts';
import { byText } from '../text-order/by-text.mts';
import type { ListedEntry, TreeListing } from './project-files-types.mts';

const SUBMODULES_FILE = '.gitmodules';
const SUBMODULE_PATHS = String.raw`^submodule\..*\.path$`;
const NO_MATCH = 1;
const GIT_PATHS = ['index', 'info/exclude'];
const CHECKED = 'checked';
const STAGED_KINDS = new Map<string, string>([
  ['120000', 'link'],
  ['160000', 'submodule'],
]);
const LISTED_KINDS = new Set<string | undefined>(['file', 'link']);

function nullSeparated(stdout: string): string[] {
  return stdout.split('\0').filter(Boolean);
}

function registeredSubmodules(directory: string): string[] {
  if (!existsSync(path.join(directory, SUBMODULES_FILE))) {
    return [];
  }
  const listed = neutralGit(
    directory,
    ['config', '--file', SUBMODULES_FILE, '--null', '--get-regexp', SUBMODULE_PATHS],
    { accepted: [0, NO_MATCH] },
  );
  return nullSeparated(listed?.stdout ?? '')
    .map((entry) => entry.slice(entry.indexOf('\n') + 1))
    .map((submodule) => path.join(directory, ...submodule.split('/')))
    .filter((absolute) => hasRepositoryMarker(absolute));
}

function stagedKinds(stdout: string): Map<string, string> {
  const kinds = new Map<string, string>();
  for (const entry of nullSeparated(stdout)) {
    const file = entry.slice(entry.indexOf('\t') + 1);
    const mode = entry.slice(0, entry.indexOf(' '));
    if (!kinds.has(file)) {
      kinds.set(file, STAGED_KINDS.get(mode) ?? 'file');
    }
  }
  return kinds;
}

function ownEntries(
  directory: string,
  pathspecs: readonly string[] = [],
): [string, string][] | undefined {
  const staged = neutralGit(directory, ['ls-files', '-z', '--stage', '--', ...pathspecs]);
  if (staged === undefined) {
    return undefined;
  }
  const changed = neutralGit(directory, [
    'ls-files',
    '-z',
    '--modified',
    '--others',
    '--exclude-standard',
    '--',
    ...pathspecs,
  ]);
  const kinds = stagedKinds(staged.stdout);
  for (const file of nullSeparated(changed?.stdout ?? '')) {
    kinds.set(file, CHECKED);
  }
  const isNested = inheritedRule((relative) =>
    hasRepositoryMarker(path.join(directory, ...relative.split('/'))),
  );
  return [...kinds].filter(([file]) => !(file.endsWith('/') || isNested(path.posix.dirname(file))));
}

function kindOf(file: string): string | undefined {
  const stats = lstatSync(file, { throwIfNoEntry: false });
  if (stats?.isFile() === true) {
    return 'file';
  }
  return stats?.isSymbolicLink() === true ? 'link' : undefined;
}

function linesOf(stdout: string): string[] {
  return stdout.split('\n').filter(Boolean);
}

function gitPathsOf(top: string): string[] | undefined {
  const probed = neutralGit(top, [
    'rev-parse',
    ...GIT_PATHS.flatMap((gitPath) => ['--git-path', gitPath]),
  ]);
  return probed === undefined
    ? undefined
    : linesOf(probed.stdout).map((file) => path.resolve(top, file));
}

function presentEntries(
  top: string,
  prefix: string,
  entries: readonly (readonly [string, string])[],
): ListedEntry[] {
  return entries
    .map(([entry, staged]) => {
      const file = `${prefix}${entry}`;
      const kind = staged === CHECKED ? kindOf(path.join(top, ...file.split('/'))) : staged;
      return { file, kind };
    })
    .filter(({ kind }) => LISTED_KINDS.has(kind));
}

export function listFolder(top: string, folder: string): ListedEntry[] | undefined {
  const entries = ownEntries(top, [`:(literal)${folder}/`]);
  return entries === undefined ? undefined : presentEntries(top, '', entries);
}

export function loadTree(top: string): TreeListing | undefined {
  const gitPaths = gitPathsOf(top);
  if (gitPaths === undefined) {
    return undefined;
  }
  const submodules = new Set<string>();
  const present: ListedEntry[][] = [];
  const pending = [{ directory: top, prefix: '' }];
  for (const { directory, prefix } of pending) {
    present.push(presentEntries(top, prefix, ownEntries(directory) ?? []));
    for (const submodule of registeredSubmodules(directory)) {
      submodules.add(submodule);
      pending.push({ directory: submodule, prefix: `${posixRelative(top, submodule)}/` });
    }
  }
  const entries = present.flat();
  return {
    files: entries.map(({ file }) => file).toSorted(byText),
    links: new Set(entries.filter(({ kind }) => kind === 'link').map(({ file }) => file)),
    submodules,
    gitPaths,
  };
}
