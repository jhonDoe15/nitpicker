import { createHash } from 'node:crypto';
import { normalizeGitPath } from './git.mjs';

export function comparisonKey(finding, baseToHeadRenames = new Map()) {
  const normalizedPath = normalizeGitPath(finding.path);
  const comparisonPath = baseToHeadRenames.get(normalizedPath) ?? normalizedPath;
  return JSON.stringify([
    finding.tool,
    finding.rule,
    comparisonPath,
    finding.symbol ?? '',
    remapIdentityPaths(finding.identity, baseToHeadRenames),
    finding.classification,
    finding.metric?.name ?? '',
  ]);
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
