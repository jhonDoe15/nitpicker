import path from 'node:path';

export function directoryMoves(renames) {
  const votes = new Map();
  for (const [oldPath, newPath] of renames) {
    recordVotes(votes, movedPrefixes(directoryOf(oldPath), directoryOf(newPath)));
  }
  return new Map(
    [...votes].map(([from, destinations]) => [from, mostVotedDestination(destinations)]),
  );
}

function directoryOf(filePath) {
  const directory = path.posix.dirname(filePath);
  return directory === '.' ? '' : directory;
}

function recordVotes(votes, pairs) {
  for (const { from, to } of pairs) {
    const destinations = votes.get(from) ?? new Map();
    destinations.set(to, (destinations.get(to) ?? 0) + 1);
    votes.set(from, destinations);
  }
}

function mostVotedDestination(destinations) {
  const [winner] = [...destinations].sort(
    ([leftTo, leftVotes], [rightTo, rightVotes]) =>
      rightVotes - leftVotes || leftTo.localeCompare(rightTo),
  );
  return winner[0];
}

function movedPrefixes(oldDirectory, newDirectory) {
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

function sharedTailLength(from, to) {
  const reversedTo = [...to].reverse();
  const mismatch = [...from].reverse().findIndex((segment, index) => segment !== reversedTo[index]);
  return mismatch === -1 ? from.length : mismatch;
}

function segments(directory) {
  return directory === '' ? [] : directory.split('/');
}

export function mapDirectory(directory, moves) {
  const parts = segments(directory);
  const ancestors = [
    ...parts.map((_, dropped) => parts.slice(0, parts.length - dropped).join('/')),
    '',
  ];
  const moved = ancestors.find((candidate) => moves.has(candidate));
  return moved === undefined
    ? directory
    : joinPath(moves.get(moved), directory.slice(moved.length).replace(/^\//, ''));
}

function joinPath(directory, rest) {
  return [directory, rest].filter((part) => part.length > 0).join('/');
}

function movedFilePath(oldPath, moves) {
  return joinPath(mapDirectory(directoryOf(oldPath), moves), path.posix.basename(oldPath));
}

export function inferMovedFiles({ deleted, added, moves }) {
  const candidates = [...deleted].map((oldPath) => [oldPath, movedFilePath(oldPath, moves)]);
  return new Map(
    candidates.filter(([oldPath, newPath]) => newPath !== oldPath && added.has(newPath)),
  );
}

export function scopeMoves({ changes, baseProjectPath, headProjectPath }) {
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

function scopePairs(pairs, { baseProjectPath, headProjectPath }) {
  return [...pairs]
    .map(([from, to]) => [relativeTo(from, baseProjectPath), relativeTo(to, headProjectPath)])
    .filter(([from, to]) => from !== undefined && to !== undefined);
}

function relativeTo(target, projectPath) {
  const project = projectPath === '.' ? '' : projectPath;
  if (project === '') {
    return target;
  }
  if (target === project) {
    return '';
  }
  return target.startsWith(`${project}/`) ? target.slice(project.length + 1) : undefined;
}

export function remapRootPrefix(identity, directories) {
  const separator = identity.indexOf('|');
  if (separator <= 0 || directories.size === 0) {
    return identity;
  }
  const mapped = mapDirectory(identity.slice(0, separator), directories);
  return `${mapped}${identity.slice(separator)}`;
}
