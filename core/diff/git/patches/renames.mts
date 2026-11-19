import path from 'node:path';
import type { RepositoryChanges } from './changes.mts';

type Votes = Map<string, Map<string, number>>;
type Scope = { readonly baseProjectPath: string; readonly headProjectPath: string };

export function directoryMoves(renames: Iterable<readonly [string, string]>): Map<string, string> {
  const votes: Votes = new Map();
  for (const [oldPath, newPath] of renames) {
    recordVotes(votes, movedPrefixes(directoryOf(oldPath), directoryOf(newPath)));
  }
  return new Map(
    [...votes].map(([from, destinations]) => [from, mostVotedDestination(destinations)]),
  );
}

export function directoryOf(filePath: string): string {
  const directory = path.posix.dirname(filePath);
  return directory === '.' ? '' : directory;
}

function recordVotes(
  votes: Votes,
  pairs: readonly { readonly from: string; readonly to: string }[],
): void {
  for (const { from, to } of pairs) {
    const destinations = votes.get(from) ?? new Map<string, number>();
    destinations.set(to, (destinations.get(to) ?? 0) + 1);
    votes.set(from, destinations);
  }
}

function mostVotedDestination(destinations: ReadonlyMap<string, number>): string {
  const [winner] = [...destinations].sort(
    ([leftTo, leftVotes], [rightTo, rightVotes]) =>
      rightVotes - leftVotes || leftTo.localeCompare(rightTo),
  );
  return winner?.[0] ?? '';
}

function movedPrefixes(
  oldDirectory: string,
  newDirectory: string,
): { readonly from: string; readonly to: string }[] {
  if (oldDirectory === newDirectory) {
    return [];
  }
  const from = segments(oldDirectory);
  const to = segments(newDirectory);
  const sharedTail = sharedTailLength(from, to);
  return Array.from({ length: sharedTail + 1 }, (_, dropped) => ({
    from: from.slice(0, from.length - dropped).join('/'),
    to: to.slice(0, to.length - dropped).join('/'),
  }));
}

function sharedTailLength(from: readonly string[], to: readonly string[]): number {
  const reversedTo = [...to].reverse();
  const mismatch = [...from].reverse().findIndex((segment, index) => segment !== reversedTo[index]);
  return mismatch === -1 ? from.length : mismatch;
}

function segments(directory: string): string[] {
  return directory === '' ? [] : directory.split('/');
}

export function mapDirectory(directory: string, moves: ReadonlyMap<string, string>): string {
  const parts = segments(directory);
  const ancestors = [
    ...parts.map((_, dropped) => parts.slice(0, parts.length - dropped).join('/')),
    '',
  ];
  const moved = ancestors.find((candidate) => moves.has(candidate));
  return moved === undefined
    ? directory
    : joinPath(moves.get(moved) ?? '', directory.slice(moved.length).replace(/^\//, ''));
}

function joinPath(directory: string, rest: string): string {
  return [directory, rest].filter((part) => part.length > 0).join('/');
}

function movedFilePath(oldPath: string, moves: ReadonlyMap<string, string>): string {
  return joinPath(mapDirectory(directoryOf(oldPath), moves), path.posix.basename(oldPath));
}

export function inferMovedFiles({
  deleted,
  added,
  moves,
}: {
  readonly deleted: ReadonlySet<string>;
  readonly added: ReadonlySet<string>;
  readonly moves: ReadonlyMap<string, string>;
}): Map<string, string> {
  const candidates = [...deleted].map((oldPath): [string, string] => [
    oldPath,
    movedFilePath(oldPath, moves),
  ]);
  return new Map(
    candidates.filter(([oldPath, newPath]) => newPath !== oldPath && added.has(newPath)),
  );
}

export type ScopedMoves = {
  readonly files: Map<string, string>;
  readonly inferred: Map<string, string>;
  readonly directories: Map<string, string>;
};

export function scopeMoves({
  changes,
  baseProjectPath,
  headProjectPath,
}: Scope & {
  readonly changes: Pick<RepositoryChanges, 'renames' | 'added' | 'deleted'>;
}): ScopedMoves {
  const moves = directoryMoves(changes.renames);
  const scope = { baseProjectPath, headProjectPath };
  const renamed = scopePairs(changes.renames, scope);
  const inferred = scopePairs(inferMovedFiles({ ...changes, moves }), scope);
  return {
    files: new Map([...renamed, ...inferred]),
    inferred: new Map(inferred),
    directories: new Map(
      scopePairs(moves, scope).filter(([baseDirectory]) => baseDirectory !== ''),
    ),
  };
}

export function scopeTouched(
  touched: Iterable<string>,
  { baseProjectPath, headProjectPath }: Scope,
): Set<string> {
  const scoped = [...touched].map(
    (file) => relativeTo(file, headProjectPath) ?? relativeTo(file, baseProjectPath),
  );
  return new Set(scoped.filter((file): file is string => file !== undefined && file !== ''));
}

function scopePairs(
  pairs: Iterable<readonly [string, string]>,
  { baseProjectPath, headProjectPath }: Scope,
): [string, string][] {
  return [...pairs].flatMap(([from, to]): [string, string][] => {
    const scopedFrom = relativeTo(from, baseProjectPath);
    const scopedTo = relativeTo(to, headProjectPath);
    return scopedFrom === undefined || scopedTo === undefined ? [] : [[scopedFrom, scopedTo]];
  });
}

function relativeTo(target: string, projectPath: string): string | undefined {
  const project = projectPath === '.' ? '' : projectPath;
  if (project === '') {
    return target;
  }
  if (target === project) {
    return '';
  }
  return target.startsWith(`${project}/`) ? target.slice(project.length + 1) : undefined;
}

export function remapRootPrefix(
  identity: string,
  directories: ReadonlyMap<string, string>,
): string {
  const separator = identity.indexOf('|');
  if (separator <= 0 || directories.size === 0) {
    return identity;
  }
  const mapped = mapDirectory(identity.slice(0, separator), directories);
  return `${mapped}${identity.slice(separator)}`;
}

export function folderMoves(renames: Iterable<readonly [string, string]>): Votes {
  const votes: Votes = new Map();
  for (const [oldPath, newPath] of renames) {
    recordVotes(votes, folderPair(oldPath, newPath));
  }
  return votes;
}

function folderPair(
  oldPath: string,
  newPath: string,
): { readonly from: string; readonly to: string }[] {
  const from = path.posix.dirname(oldPath);
  const to = path.posix.dirname(newPath);
  return from === to ? [] : [{ from, to }];
}

export function mainDestination(
  destinations: ReadonlyMap<string, number> | undefined,
): string | undefined {
  return destinations === undefined ? undefined : mostVotedDestination(destinations);
}
