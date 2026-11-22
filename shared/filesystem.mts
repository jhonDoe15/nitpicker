import { existsSync, lstatSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { depthFirst } from './traversal.mts';

const CHUNK_BYTES = 1024 * 1024;
const ABSENT_CODES: ReadonlySet<unknown> = new Set(['ENOENT', 'ENOTDIR']);

export function pathInside(root: string, relative: string): string | undefined {
  const full = path.resolve(root, relative);
  const fromRoot = path.relative(path.resolve(root), full);
  if (fromRoot === '..' || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
    return undefined;
  }
  return full;
}

export function readBoundedText(root: string, file: string, maxBytes: number): string | undefined {
  const full = pathInside(root, file);
  if (full === undefined) {
    return undefined;
  }
  const stats = lstatSync(full, { throwIfNoEntry: false });
  return stats?.isFile() === true && stats.size <= maxBytes
    ? readFileSync(full, 'utf8')
    : undefined;
}

export function isFile(file: string): boolean {
  return statSync(file, { throwIfNoEntry: false })?.isFile() === true;
}

export function isDirectory(directory: string): boolean {
  return statSync(directory, { throwIfNoEntry: false })?.isDirectory() === true;
}

export function isStrictlyInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function readTextIfExists(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && ABSENT_CODES.has(error.code)) {
      return '';
    }
    throw error;
  }
}

export function firstFileIn(root: string, names: readonly string[]): string | undefined {
  return names.map((name) => path.join(root, name)).find((file) => existsSync(file));
}

export function filesEndingWith(directories: readonly string[], extension: string): string[] {
  return directories
    .filter((directory) => existsSync(directory))
    .flatMap((directory) =>
      readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
        .map((entry) => path.join(entry.parentPath, entry.name)),
    )
    .sort();
}

export function ancestorDirectories(directory: string): string[] {
  const found = [directory];
  for (const current of found) {
    const parent = path.dirname(current);
    if (parent !== current) {
      found.push(parent);
    }
  }
  return found;
}

type Frame = { readonly absolute: string; readonly entry?: Dirent };
type FilesUnderOptions = {
  readonly skipDirectory?: (absolute: string, entry: Dirent) => boolean;
  readonly includeLinks?: true;
};

function skipNoDirectory(_absolute: string, _entry: Dirent): boolean {
  return false;
}

export function* filesUnder(
  root: string,
  { skipDirectory = skipNoDirectory, includeLinks }: FilesUnderOptions = {},
): Generator<string, void, undefined> {
  function children(frame: Frame): Frame[] {
    if (frame.entry && (!frame.entry.isDirectory() || skipDirectory(frame.absolute, frame.entry))) {
      return [];
    }
    return readdirSync(frame.absolute, { withFileTypes: true }).map((entry) => ({
      absolute: path.join(frame.absolute, entry.name),
      entry,
    }));
  }
  for (const frame of depthFirst({ absolute: root }, children)) {
    if (frame.entry?.isFile() || (includeLinks && frame.entry?.isSymbolicLink())) {
      yield frame.absolute;
    }
  }
}

export function byteChunks(descriptor: number): Iterable<Buffer> {
  const buffer = Buffer.alloc(CHUNK_BYTES);
  const reached = { position: 0 };
  return {
    [Symbol.iterator]: () => ({
      next: (): IteratorResult<Buffer> => {
        const read = readSync(descriptor, buffer, 0, buffer.length, reached.position);
        reached.position += read;
        return read > 0
          ? { done: false, value: buffer.subarray(0, read) }
          : { done: true, value: undefined };
      },
    }),
  };
}
