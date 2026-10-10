import { createHash } from 'node:crypto';
import { normalizeGitPath } from './git.mjs';
import { remapRootPrefix } from './renames.mjs';

export function comparisonKey(
  finding,
  baseToHeadRenames = new Map(),
  baseToHeadDirectories = new Map(),
) {
  const normalizedPath = normalizeGitPath(finding.path);
  const cycle = parseCycleIdentity(finding.identity);
  const canonical =
    cycle === undefined
      ? {
          path: baseToHeadRenames.get(normalizedPath) ?? normalizedPath,
          identity: remapRootPrefix(
            remapIdentityPaths(finding.identity, baseToHeadRenames),
            baseToHeadDirectories,
          ),
        }
      : remapCycle(cycle, baseToHeadRenames);
  return JSON.stringify([
    finding.tool,
    finding.rule,
    canonical.path,
    finding.symbol ?? '',
    canonical.identity,
    finding.classification,
    finding.metric?.name ?? '',
  ]);
}

// Dependency-cycle findings are identified by their member modules (`cycle:a>b>c|...`), listed
// from the lexicographically smallest rotation and anchored at its first module. Renaming a member
// can change which rotation is smallest, so the renamed cycle is re-rotated before comparing.
function parseCycleIdentity(identity) {
  const match = /^cycle:([^|]+)(\|.*)?$/.exec(identity);
  return match === null ? undefined : { members: match[1].split('>'), suffix: match[2] ?? '' };
}

function remapCycle({ members, suffix }, baseToHeadRenames) {
  const remapped = members.map((member) => baseToHeadRenames.get(member) ?? member);
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

export function remapIdentityPaths(identity, baseToHeadRenames) {
  let remappedIdentity = identity;
  const renames = [...baseToHeadRenames].sort(
    ([leftPath], [rightPath]) => rightPath.length - leftPath.length,
  );
  for (const [oldPath, newPath] of renames) {
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
