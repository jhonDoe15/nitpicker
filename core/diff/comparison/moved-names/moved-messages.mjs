import { normalizeGitPath } from '../../git/normalize.mjs';
import { remapQualifiedNames } from './qualified-names.mjs';

const LINE_REFERENCE = /\bline '?\d+'?/gu;

function keyOf(finding, { path, message }) {
  return JSON.stringify([
    finding.tool,
    finding.rule,
    finding.classification,
    path,
    message.replaceAll(LINE_REFERENCE, 'line'),
  ]);
}

function byLine(left, right) {
  return (left.location?.line ?? 0) - (right.location?.line ?? 0);
}

export function matchMovedMessages({ headFindings, baseFindings, moves }) {
  if (moves.names.size === 0) {
    return [];
  }
  const candidates = new Map();
  for (const base of baseFindings.toSorted(byLine)) {
    const message = remapQualifiedNames(base.message, moves.names);
    if (message !== base.message) {
      const path = normalizeGitPath(base.path);
      const key = keyOf(base, { path: moves.files.get(path) ?? path, message });
      candidates.set(key, [...(candidates.get(key) ?? []), base]);
    }
  }
  const pairs = [];
  for (const head of headFindings.toSorted(byLine)) {
    const found = candidates.get(
      keyOf(head, { path: normalizeGitPath(head.path), message: head.message }),
    );
    if (found !== undefined && found.length > 0) {
      pairs.push({ head, base: found.shift() });
    }
  }
  return pairs;
}
