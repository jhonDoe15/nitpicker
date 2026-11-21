import { existsSync } from 'node:fs';
import path from 'node:path';
import { filesUnder } from '../filesystem.mts';
import { chainOf } from '../traversal.mts';
import type { WalkOptions } from './project-files-types.mts';

const REPOSITORY_MARKER = '.git';
const ROOT_DIRECTORY = '.';

export function hasRepositoryMarker(directory: string): boolean {
  return existsSync(path.join(directory, REPOSITORY_MARKER));
}

export function inheritedRule(
  ownRule: (directory: string) => boolean,
): (directory: string) => boolean {
  const known = new Map<string, boolean>([[ROOT_DIRECTORY, false]]);
  return (directory) => {
    const chain = chainOf(directory, (current: string) =>
      known.has(current) ? undefined : path.posix.dirname(current),
    );
    for (const current of chain.toReversed().slice(1)) {
      known.set(current, known.get(path.posix.dirname(current)) || ownRule(current));
    }
    return known.get(directory) === true;
  };
}

export function posixRelative(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join('/');
}

export function posixRelatives(from: string, files: readonly string[]): string[] {
  return files.map((file) => posixRelative(from, file));
}

export function walkedPaths(
  root: string,
  { skipDirectory, registered, includeLinks }: WalkOptions,
): string[] {
  const known = registered ?? new Set<string>();
  const files = filesUnder(root, {
    ...(includeLinks === true ? { includeLinks } : {}),
    skipDirectory: (absolute, entry) =>
      entry.name === REPOSITORY_MARKER ||
      (hasRepositoryMarker(absolute) && !known.has(absolute)) ||
      skipDirectory(absolute, entry),
  });
  return [...files]
    .filter((file) => path.basename(file) !== REPOSITORY_MARKER)
    .map((file) => posixRelative(root, file));
}
