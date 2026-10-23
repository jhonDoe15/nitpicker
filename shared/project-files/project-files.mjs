import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { filesUnder, pathInside } from '../filesystem.mjs';
import { chainOf } from '../traversal.mjs';

const MAX_LISTING_BYTES = 64 * 1024 * 1024;
const REPOSITORY_MARKER = '.git';
const ROOT_DIRECTORY = '.';

function listedByGit(directory, pathspecs) {
  const listed = spawnSync(
    'git',
    [
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      ...(pathspecs.length === 0 ? [] : ['--', ...pathspecs]),
    ],
    { cwd: directory, encoding: 'utf8', maxBuffer: MAX_LISTING_BYTES },
  );
  return listed.error === undefined && listed.status === 0
    ? listed.stdout.split('\0').filter(Boolean)
    : undefined;
}

function inheritedRule(ownRule) {
  const known = new Map([[ROOT_DIRECTORY, false]]);
  return (directory) => {
    const chain = chainOf(directory, (current) =>
      known.has(current) ? undefined : path.posix.dirname(current),
    );
    for (const current of chain.toReversed().slice(1)) {
      known.set(current, known.get(path.posix.dirname(current)) || ownRule(current));
    }
    return known.get(directory);
  };
}

function hasRepositoryMarker(root, directory) {
  return existsSync(pathInside(root, `${directory}/${REPOSITORY_MARKER}`) ?? '');
}

export function gitProjectFiles(root, pathspecs = []) {
  const listed = listedByGit(root, pathspecs);
  if (listed === undefined) {
    return undefined;
  }
  const isNested = inheritedRule((directory) => hasRepositoryMarker(root, directory));
  return [...new Set(listed)]
    .filter((file) => !file.endsWith('/') && !isNested(path.posix.dirname(file)))
    .toSorted();
}

function isRegularFile(file) {
  return lstatSync(file, { throwIfNoEntry: false })?.isFile() === true;
}

function walkedFiles(root, skipDirectory) {
  return [
    ...filesUnder(root, {
      skipDirectory: (absolute, entry) =>
        entry.name === REPOSITORY_MARKER ||
        existsSync(path.join(absolute, REPOSITORY_MARKER)) ||
        skipDirectory(absolute, entry),
    }),
  ];
}

export function projectFilesUnder(root, { skipDirectory = () => false } = {}) {
  const listed = gitProjectFiles(root);
  if (listed === undefined || listed.length === 0) {
    return walkedFiles(root, skipDirectory);
  }
  const isSkipped = inheritedRule((directory) =>
    skipDirectory(path.join(root, ...directory.split('/')), {
      name: path.posix.basename(directory),
      isDirectory: () => true,
    }),
  );
  return listed
    .filter((file) => !isSkipped(path.posix.dirname(file)))
    .map((file) => path.join(root, ...file.split('/')))
    .filter(isRegularFile);
}
