import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

const MAX_FILE_BYTES = 512 * 1024;
const MAX_LISTING_BYTES = 1024 * 1024 * 1024;
const BLOB_MODES = new Set(['100644', '100755']);
const LINK_MODE = '120000';
const LINK_HOPS = Array.from({ length: 10 });

export function commitSource({ repositoryRoot, commitSha, projectRoot }) {
  const projectRelativePath = path.relative(repositoryRoot, projectRoot);
  const prefix =
    projectRelativePath === '' ? '' : `${projectRelativePath.split(path.sep).join('/')}/`;
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
      readResolved(
        repositoryRoot,
        blobs,
        files.filter((file) => blobs.has(file)),
      ),
  };
}

function linkTarget(blobs, linkTexts, blob) {
  return blobs.get(path.posix.join(path.posix.dirname(blob.file), linkTexts.get(blob.file) ?? ''));
}

function resolvedBlob(blobs, linkTexts, file) {
  const settled = LINK_HOPS.reduce(
    (blob) => (blob?.link === true ? linkTarget(blobs, linkTexts, blob) : blob),
    blobs.get(file),
  );
  return settled?.link === true ? undefined : settled;
}

function readLinkTexts(repositoryRoot, blobs, files) {
  const requested = files.some((file) => blobs.get(file).link);
  const links = requested ? [...blobs.values()].filter(({ link }) => link) : [];
  return new Map([...readBlobs(repositoryRoot, links)].map(([file, text]) => [file, text.trim()]));
}

function readResolved(repositoryRoot, blobs, files) {
  const linkTexts = readLinkTexts(repositoryRoot, blobs, files);
  const resolved = files
    .map((file) => [file, resolvedBlob(blobs, linkTexts, file)])
    .filter(([, blob]) => blob !== undefined);
  const texts = readBlobs(repositoryRoot, [...new Set(resolved.map(([, blob]) => blob))]);
  return new Map(resolved.map(([file, blob]) => [file, texts.get(blob.file)]));
}

export function lazySource(create) {
  const created = [];
  function source() {
    if (created.length === 0) {
      created.push(create());
    }
    return created[0];
  }
  return { paths: () => source().paths(), readMany: (files) => source().readMany(files) };
}

export function filteredSource(source, accepts) {
  return {
    paths: () => source.paths().filter(accepts),
    readMany: (files) => source.readMany(files.filter(accepts)),
  };
}

export function headCommit(projectRoot) {
  const repositoryRoot = realpathSync(
    git(projectRoot, ['rev-parse', '--show-toplevel']).toString('utf8').trim(),
  );
  const commitSha = git(repositoryRoot, ['rev-parse', 'HEAD^{commit}']).toString('utf8').trim();
  return { repositoryRoot, commitSha };
}

export function workingTreeSource(projectRoot) {
  const root = realpathSync(projectRoot);
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
          const text = readSmallFile(root, path.join(projectRoot, file));
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
    !(BLOB_MODES.has(mode) || mode === LINK_MODE) ||
    Number(size) > MAX_FILE_BYTES ||
    !file.startsWith(prefix)
  ) {
    return undefined;
  }
  return { file: file.slice(prefix.length), oid, size: Number(size), link: mode === LINK_MODE };
}

function insideTree(root, file) {
  const resolved = realpathSync(file);
  return resolved === root || resolved.startsWith(root + path.sep);
}

function statFile(file) {
  try {
    return statSync(file, { throwIfNoEntry: false });
  } catch (error) {
    if (error.code === 'ELOOP') {
      return undefined;
    }
    throw error;
  }
}

function readSmallFile(root, file) {
  const stats = statFile(file);
  return stats?.isFile() === true && stats.size <= MAX_FILE_BYTES && insideTree(root, file)
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
