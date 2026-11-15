import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync, type Stats } from 'node:fs';
import path from 'node:path';
import { projectFilePaths as untypedProjectFilePaths } from '../../shared/project-files/project-files.mjs';
import { fieldOf } from '../../shared/values/readers.mts';
import type { CommitRef, ConventionSource, PathsOptions } from './typed/convention-types.mts';
import { GIT_TIMEOUT_MS } from '../../shared/processes/deadlines.mjs';

type Blob = {
  readonly file: string;
  readonly oid: string;
  readonly size: number;
  readonly link: boolean;
};

const projectFilePaths: (root: string, options: { readonly includeLinks: true }) => string[] =
  untypedProjectFilePaths;

const MAX_FILE_BYTES = 512 * 1024;
const MAX_LISTING_BYTES = 1024 * 1024 * 1024;
const BLOB_MODES = new Set(['100644', '100755']);
const LINK_MODE = '120000';
const LINK_HOPS = Array.from({ length: 10 });

export function commitSource({
  repositoryRoot,
  commitSha,
  projectRoot,
}: CommitRef & { readonly projectRoot: string }): ConventionSource {
  const projectRelativePath = path.relative(repositoryRoot, projectRoot);
  const prefix =
    projectRelativePath === '' ? '' : `${projectRelativePath.split(path.sep).join('/')}/`;
  const blobs = new Map<string, Blob>();
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
    paths: ({ unreadable }: PathsOptions = {}) =>
      [...blobs.values()]
        .filter(({ size }) => unreadable === true || size <= MAX_FILE_BYTES)
        .map(({ file }) => file),
    readMany: (files: readonly string[]) =>
      readResolved(
        repositoryRoot,
        blobs,
        files.filter((file) => (blobs.get(file)?.size ?? Infinity) <= MAX_FILE_BYTES),
      ),
  };
}

function linkTarget(
  blobs: ReadonlyMap<string, Blob>,
  linkTexts: ReadonlyMap<string, string>,
  blob: Blob,
): Blob | undefined {
  return blobs.get(path.posix.join(path.posix.dirname(blob.file), linkTexts.get(blob.file) ?? ''));
}

function resolvedBlob(
  blobs: ReadonlyMap<string, Blob>,
  linkTexts: ReadonlyMap<string, string>,
  file: string,
): Blob | undefined {
  const settled = LINK_HOPS.reduce<Blob | undefined>(
    (blob) => (blob?.link === true ? linkTarget(blobs, linkTexts, blob) : blob),
    blobs.get(file),
  );
  return settled?.link === true ? undefined : settled;
}

function readLinkTexts(
  repositoryRoot: string,
  blobs: ReadonlyMap<string, Blob>,
  files: readonly string[],
): Map<string, string> {
  const requested = files.some((file) => blobs.get(file)?.link === true);
  const links = requested ? [...blobs.values()].filter(({ link }) => link) : [];
  return new Map([...readBlobs(repositoryRoot, links)].map(([file, text]) => [file, text.trim()]));
}

function readResolved(
  repositoryRoot: string,
  blobs: ReadonlyMap<string, Blob>,
  files: readonly string[],
): Map<string, string> {
  const linkTexts = readLinkTexts(repositoryRoot, blobs, files);
  const resolved = files.flatMap((file) => {
    const blob = resolvedBlob(blobs, linkTexts, file);
    return blob === undefined ? [] : [[file, blob] as const];
  });
  const texts = readBlobs(repositoryRoot, [...new Set(resolved.map(([, blob]) => blob))]);
  return new Map(
    resolved.flatMap(([file, blob]) => {
      const text = texts.get(blob.file);
      return text === undefined ? [] : [[file, text] as const];
    }),
  );
}

export function lazySource(create: () => ConventionSource): ConventionSource {
  const created: ConventionSource[] = [];
  function source(): ConventionSource {
    const existing = created[0] ?? create();
    if (created.length === 0) {
      created.push(existing);
    }
    return existing;
  }
  return {
    paths: (options?: PathsOptions) => source().paths(options),
    readMany: (files: readonly string[]) => source().readMany(files),
  };
}

export function filteredSource(
  source: ConventionSource,
  accepts: (file: string) => boolean,
): ConventionSource {
  return {
    paths: (options?: PathsOptions) => source.paths(options).filter(accepts),
    readMany: (files: readonly string[]) => source.readMany(files.filter(accepts)),
  };
}

export function headCommit(projectRoot: string): CommitRef {
  const repositoryRoot = realpathSync(
    git(projectRoot, ['rev-parse', '--show-toplevel']).toString('utf8').trim(),
  );
  const commitSha = git(repositoryRoot, ['rev-parse', 'HEAD^{commit}']).toString('utf8').trim();
  return { repositoryRoot, commitSha };
}

export function workingTreeSource(projectRoot: string): ConventionSource {
  const root = realpathSync(projectRoot);
  const listing = projectFilePaths(projectRoot, { includeLinks: true });
  return {
    paths: () => listing,
    readMany: (files: readonly string[]) =>
      new Map(
        files.flatMap((file) => {
          const text = readSmallFile(root, path.join(projectRoot, file));
          return text === undefined ? [] : [[file, text] as const];
        }),
      ),
  };
}

function parseTreeEntry(entry: string, prefix: string): Blob | undefined {
  const tab = entry.indexOf('\t');
  const [mode = '', type, oid = '', size] = entry.slice(0, tab).split(/ +/);
  const file = entry.slice(tab + 1);
  if (
    tab < 0 ||
    type !== 'blob' ||
    !(BLOB_MODES.has(mode) || mode === LINK_MODE) ||
    !file.startsWith(prefix)
  ) {
    return undefined;
  }
  return { file: file.slice(prefix.length), oid, size: Number(size), link: mode === LINK_MODE };
}

function insideTree(root: string, file: string): boolean {
  const resolved = realpathSync(file);
  return resolved === root || resolved.startsWith(root + path.sep);
}

function statFile(file: string): Stats | undefined {
  try {
    return statSync(file, { throwIfNoEntry: false });
  } catch (error) {
    if (fieldOf(error, 'code') === 'ELOOP') {
      return undefined;
    }
    throw error;
  }
}

function readSmallFile(root: string, file: string): string | undefined {
  const stats = statFile(file);
  return stats?.isFile() === true && stats.size <= MAX_FILE_BYTES && insideTree(root, file)
    ? readFileSync(file, 'utf8')
    : undefined;
}

function readBlobs(repositoryRoot: string, blobs: readonly Blob[]): Map<string, string> {
  if (blobs.length === 0) {
    return new Map<string, string>();
  }
  const output = git(
    repositoryRoot,
    ['cat-file', '--batch'],
    blobs.map(({ oid }) => `${oid}\n`).join(''),
  );
  const texts = new Map<string, string>();
  let offset = 0;
  for (const { file, size } of blobs) {
    offset = output.indexOf(0x0a, offset) + 1;
    texts.set(file, output.subarray(offset, offset + size).toString('utf8'));
    offset += size + 1;
  }
  return texts;
}

function git(cwd: string, args: readonly string[], input?: string): Buffer {
  const result = spawnSync('git', args, {
    cwd,
    input,
    maxBuffer: MAX_LISTING_BYTES,
    timeout: GIT_TIMEOUT_MS,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed in ${cwd}: ${result.error?.message ?? result.stderr.toString('utf8').trim()}`,
    );
  }
  return result.stdout;
}
