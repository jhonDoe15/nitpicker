import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const MAX_FILE_BYTES = 512 * 1024;
const MAX_LISTING_BYTES = 1024 * 1024 * 1024;
const BLOB_MODES = new Set(['100644', '100755']);

export function commitSource({ repositoryRoot, commitSha, projectRelativePath }) {
  const prefix =
    projectRelativePath === '.' ? '' : `${projectRelativePath.split(path.sep).join('/')}/`;
  const blobs = new Map();
  const listing = git(repositoryRoot, [
    'ls-tree',
    '-r',
    '-z',
    '-l',
    commitSha,
    '--',
    prefix || '.',
  ]);
  for (const entry of listing.toString('utf8').split('\0')) {
    const blob = parseTreeEntry(entry, prefix);
    if (blob !== undefined) {
      blobs.set(blob.file, blob);
    }
  }
  return {
    paths: () => [...blobs.keys()],
    readMany: (files) =>
      readBlobs(
        repositoryRoot,
        files.map((file) => blobs.get(file)),
      ),
  };
}

export function workingTreeSource(projectRoot) {
  const listing = git(projectRoot, [
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
  ]);
  return {
    paths: () =>
      listing
        .toString('utf8')
        .split('\0')
        .filter((file) => file.length > 0),
    readMany: (files) =>
      new Map(
        files.flatMap((file) => {
          const text = readSmallFile(path.join(projectRoot, file));
          return text === undefined ? [] : [[file, text]];
        }),
      ),
  };
}

function parseTreeEntry(entry, prefix) {
  const tab = entry.indexOf('\t');
  const [mode, type, oid, size] = entry.slice(0, tab).split(/ +/);
  const file = entry.slice(tab + 1);
  if (
    tab < 0 ||
    type !== 'blob' ||
    !BLOB_MODES.has(mode) ||
    Number(size) > MAX_FILE_BYTES ||
    !file.startsWith(prefix)
  ) {
    return undefined;
  }
  return { file: file.slice(prefix.length), oid, size: Number(size) };
}

function readSmallFile(file) {
  const stats = statSync(file, { throwIfNoEntry: false });
  return stats?.isFile() === true && stats.size <= MAX_FILE_BYTES
    ? readFileSync(file, 'utf8')
    : undefined;
}

function readBlobs(repositoryRoot, blobs) {
  if (blobs.length === 0) {
    return new Map();
  }
  const output = git(
    repositoryRoot,
    ['cat-file', '--batch'],
    blobs.map(({ oid }) => `${oid}\n`).join(''),
  );
  const texts = new Map();
  let offset = 0;
  for (const { file, size } of blobs) {
    offset = output.indexOf(0x0a, offset) + 1;
    texts.set(file, output.subarray(offset, offset + size).toString('utf8'));
    offset += size + 1;
  }
  return texts;
}

function git(cwd, args, input) {
  const result = spawnSync('git', args, { cwd, input, maxBuffer: MAX_LISTING_BYTES });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed in ${cwd}: ${result.error?.message ?? result.stderr.toString('utf8').trim()}`,
    );
  }
  return result.stdout;
}
