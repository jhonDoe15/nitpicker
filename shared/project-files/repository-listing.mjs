import { existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { neutralGit } from './git-command.mjs';
import { hasRepositoryMarker, inheritedRule, posixRelative } from './tree-walk.mjs';

const SUBMODULES_FILE = '.gitmodules';
const SUBMODULE_PATHS = String.raw`^submodule\..*\.path$`;
const NO_MATCH = 1;
const GIT_PATHS = ['index', 'info/exclude'];

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

function ownEntries(directory) {
  const listed = neutralGit(directory, [
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
  ]);
  if (listed === undefined) {
    return undefined;
  }
  const isNested = inheritedRule((relative) =>
    hasRepositoryMarker(path.join(directory, ...relative.split('/'))),
  );
  return [...new Set(nullSeparated(listed.stdout))].filter(
    (file) => !file.endsWith('/') && !isNested(path.posix.dirname(file)),
  );
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
    .map((entry) => `${prefix}${entry}`)
    .map((file) => ({ file, kind: kindOf(path.join(top, ...file.split('/'))) }))
    .filter(({ kind }) => kind !== undefined);
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
    files: entries.map(({ file }) => file).toSorted(),
    links: new Set(entries.filter(({ kind }) => kind === 'link').map(({ file }) => file)),
    submodules,
    gitPaths,
  };
}
