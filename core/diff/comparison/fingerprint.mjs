import { createHash } from 'node:crypto';
import { normalizeGitPath } from '../git/normalize.mjs';
import { remapRootPrefix } from '../git/patches/renames.mjs';

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

function parseCycleIdentity(identity) {
  const match = /^cycle:([^|]+)(\|.*)?$/.exec(identity);
  return match === null ? undefined : { members: match[1].split('>'), suffix: match.at(2) ?? '' };
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

function remapIdentityPaths(identity, baseToHeadRenames) {
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

const MIN_SIMILAR_TOKENS = 3;

function similarGroup(finding, renames) {
  const normalizedPath = normalizeGitPath(finding.path);
  return JSON.stringify([
    finding.tool,
    finding.rule,
    renames.get(normalizedPath) ?? normalizedPath,
    finding.classification,
  ]);
}

function isSimilar(head, base) {
  return (
    head.tokens.length >= MIN_SIMILAR_TOKENS &&
    head.tokens.length === base.tokens.length &&
    head.tokens.filter((token, index) => token !== base.tokens[index]).length <= 1
  );
}

function similarBase(head, candidates, matchedBase) {
  if (head.tokens === undefined) {
    return undefined;
  }
  return (candidates.get(similarGroup(head, new Map())) ?? []).find(
    (candidate) => !matchedBase.has(candidate) && isSimilar(head, candidate),
  );
}

export function matchSimilarFindings({ headFindings, baseFindings, renames }) {
  const candidates = Map.groupBy(
    baseFindings.filter((finding) => finding.tokens !== undefined),
    (finding) => similarGroup(finding, renames),
  );
  const matchedBase = new Set();
  const matched = [];
  const unmatched = [];
  for (const head of headFindings) {
    const base = similarBase(head, candidates, matchedBase);
    if (base === undefined) {
      unmatched.push(head);
    } else {
      matchedBase.add(base);
      matched.push(head);
    }
  }
  return { matched, unmatched, matchedBase };
}
