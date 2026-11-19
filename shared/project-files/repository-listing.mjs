import { existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { neutralGit } from './git-command.mjs';
import { hasRepositoryMarker, inheritedRule, posixRelative } from './tree-walk.mjs';
import { byText } from '../text-order/by-text.mjs';

const SUBMODULES_FILE = '.gitmodules';
const SUBMODULE_PATHS = String.raw`^submodule\..*\.path$`;
const NO_MATCH = 1;
const GIT_PATHS = ['index', 'info/exclude'];
const CHECKED = 'checked';
const STAGED_KINDS = new Map([
  ['120000', 'link'],
  ['160000', 'submodule'],
]);
const LISTED_KINDS = new Set(['file', 'link']);

function nullSeparated(stdout) {
  return stdout.split('\0').filter(Boolean);
}

function registeredSubmodules(directory) {
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

function stagedKinds(stdout) {
  const kinds = new Map();
  for (const entry of nullSeparated(stdout)) {
    const file = entry.slice(entry.indexOf('\t') + 1);
    const mode = entry.slice(0, entry.indexOf(' '));
    if (!kinds.has(file)) {
      kinds.set(file, STAGED_KINDS.get(mode) ?? 'file');
    }
  }
  return kinds;
}

function ownEntries(directory, pathspecs = []) {
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

function kindOf(file) {
  const stats = lstatSync(file, { throwIfNoEntry: false });
  if (stats?.isFile() === true) {
    return 'file';
  }
  return stats?.isSymbolicLink() === true ? 'link' : undefined;
}

function linesOf(stdout) {
  return stdout.split('\n').filter(Boolean);
}

function gitPathsOf(top) {
  const probed = neutralGit(top, [
    'rev-parse',
    ...GIT_PATHS.flatMap((gitPath) => ['--git-path', gitPath]),
  ]);
  return probed === undefined
    ? undefined
    : linesOf(probed.stdout).map((file) => path.resolve(top, file));
}

function presentEntries(top, prefix, entries) {
  return entries
    .map(([entry, staged]) => {
      const file = `${prefix}${entry}`;
      const kind = staged === CHECKED ? kindOf(path.join(top, ...file.split('/'))) : staged;
      return { file, kind };
    })
    .filter(({ kind }) => LISTED_KINDS.has(kind));
}

export function listFolder(top, folder) {
  const entries = ownEntries(top, [`:(literal)${folder}/`]);
  return entries === undefined ? undefined : presentEntries(top, '', entries);
}

export function loadTree(top) {
  const gitPaths = gitPathsOf(top);
  if (gitPaths === undefined) {
    return undefined;
  }
  const submodules = new Set();
  const present = [];
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
