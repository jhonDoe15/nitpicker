import { createHash } from 'node:crypto';
import { normalizeGitPath } from '../git/normalize.mjs';
import { remapRootPrefix } from '../git/patches/renames.mjs';
import {
  packageMoves,
  qualifiedNameMoves,
  remapQualifiedNames,
} from './moved-names/qualified-names.mjs';

const NO_MOVES = baseMoves(new Map());

export function baseMoves(baseToHeadRenames, baseToHeadDirectories = new Map()) {
  return {
    files: baseToHeadRenames,
    longestFirst: [...baseToHeadRenames].sort(
      ([leftPath], [rightPath]) => rightPath.length - leftPath.length,
    ),
    directories: baseToHeadDirectories,
    names: qualifiedNameMoves(baseToHeadRenames),
  };
}

export function comparisonKey(finding, moves = NO_MOVES) {
  const normalizedPath = normalizeGitPath(finding.path);
  const movedPath = moves.files.get(normalizedPath);
  const packages = packageMoves(normalizedPath, movedPath);
  const cycle = parseCycleIdentity(finding.identity);
  const canonical =
    cycle === undefined
      ? {
          path: movedPath ?? normalizedPath,
          identity: remapQualifiedNames(
            remapRootPrefix(remapIdentityPaths(finding.identity, moves), moves.directories),
            moves.names,
            packages,
          ),
        }
      : remapCycle(cycle, moves);
  const symbol = remapQualifiedNames(
    remapIdentityPaths(finding.symbol ?? '', moves),
    moves.names,
    packages,
  );
  return JSON.stringify([
    finding.tool,
    finding.rule,
    canonical.path,
    symbol,
    canonical.identity,
    finding.classification,
    finding.metric?.name ?? '',
  ]);
}

function parseCycleIdentity(identity) {
  const match = /^cycle:([^|]+)(\|.*)?$/.exec(identity);
  return match === null ? undefined : { members: match[1].split('>'), suffix: match.at(2) ?? '' };
}

function remapCycle({ members, suffix }, moves) {
  const remapped = members.map(
    (member) => moves.files.get(member) ?? remapQualifiedNames(member, moves.names),
  );
  const rotations = remapped.map((_, index) => [
    ...remapped.slice(index),
    ...remapped.slice(0, index),
  ]);
  const [canonicalMembers] = rotations.sort((left, right) =>
    left.join('\0').localeCompare(right.join('\0')),
  );
  return {
    path: canonicalMembers[0],
    identity: `cycle:${canonicalMembers.join('>')}${suffix}`,
  };
}

function remapIdentityPaths(identity, moves) {
  let remappedIdentity = identity;
  for (const [oldPath, newPath] of moves.longestFirst) {
    remappedIdentity = remappedIdentity.replaceAll(oldPath, newPath);
  }
  return remappedIdentity;
}

export function canonicalCycleIdentity(edges) {
  if (!Array.isArray(edges) || edges.length === 0) {
    throw new TypeError('A cycle identity requires at least one directed edge');
  }

  const canonicalEdges = edges.map((edge, index) => {
    if (
      typeof edge !== 'object' ||
      edge === null ||
      typeof edge.source !== 'string' ||
      typeof edge.target !== 'string'
    ) {
      throw new TypeError(`Cycle edge ${String(index)} must contain source and target paths`);
    }
    return `${normalizeGitPath(edge.source)}\0${normalizeGitPath(edge.target)}`;
  });
  canonicalEdges.sort();
  return createHash('sha256').update(canonicalEdges.join('\n')).digest('hex');
}
