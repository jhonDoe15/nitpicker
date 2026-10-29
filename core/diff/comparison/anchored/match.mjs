import { normalizeGitPath } from '../../git/normalize.mjs';
import { isOnUnchangedLine } from '../ratchet/touched-code.mjs';

function anchorKey(finding, renames) {
  const normalizedPath = normalizeGitPath(finding.path);
  return JSON.stringify([
    finding.tool,
    finding.rule,
    renames.get(normalizedPath) ?? normalizedPath,
    finding.classification,
    finding.anchor.key,
  ]);
}

function byLine(left, right) {
  return (
    (left.location?.line ?? 0) - (right.location?.line ?? 0) ||
    left.identity.localeCompare(right.identity)
  );
}

function canMove(head, touchedCode) {
  return (
    head.anchor !== undefined &&
    (head.anchor.requireUnchangedLine !== true || isOnUnchangedLine(head, touchedCode))
  );
}

export function matchAnchoredFindings({ headFindings, baseFindings, renames, touchedCode }) {
  const baseByAnchor = new Map();
  for (const base of baseFindings
    .filter((finding) => finding.anchor !== undefined)
    .toSorted(byLine)) {
    const key = anchorKey(base, renames);
    baseByAnchor.set(key, [...(baseByAnchor.get(key) ?? []), base]);
  }
  const pairs = [];
  for (const head of headFindings
    .filter((finding) => canMove(finding, touchedCode))
    .toSorted(byLine)) {
    const base = baseByAnchor.get(anchorKey(head, new Map()))?.shift();
    if (base !== undefined) {
      pairs.push({ head, base });
    }
  }
  return pairs;
}
