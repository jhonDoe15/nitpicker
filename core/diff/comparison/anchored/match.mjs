import { normalizeGitPath } from '../../git/normalize.mjs';
import { isBelowChange, isOnInsertedLine, isOnUnchangedLine } from '../ratchet/touched-code.mjs';

function placeOf(finding, renames) {
  const normalizedPath = normalizeGitPath(finding.path);
  return [finding.tool, renames.get(normalizedPath) ?? normalizedPath];
}

function anchorKey(finding, renames) {
  return JSON.stringify([
    ...placeOf(finding, renames),
    finding.rule,
    finding.classification,
    finding.anchor.key,
  ]);
}

function symbolKey(finding, renames) {
  return JSON.stringify([...placeOf(finding, renames), finding.symbol]);
}

function symbolsOf(findings, renames) {
  return new Set(
    findings
      .filter((finding) => finding.symbol !== undefined)
      .map((finding) => symbolKey(finding, renames)),
  );
}

function byLine(left, right) {
  return (
    (left.location?.line ?? 0) - (right.location?.line ?? 0) ||
    left.identity.localeCompare(right.identity)
  );
}

function canMove(head, touchedCode) {
  if (head.anchor === undefined || isOnInsertedLine(head, touchedCode)) {
    return false;
  }
  return (
    head.anchor.requireUnchangedLine !== true ||
    (isOnUnchangedLine(head, touchedCode) && isBelowChange(head, touchedCode))
  );
}

function symbolMoved({ head, base }, { renames, symbols }) {
  return (
    head.anchor.requireUnchangedLine !== true ||
    head.symbol === undefined ||
    base.symbol === undefined ||
    (!symbols.base.has(symbolKey(head, new Map())) && !symbols.head.has(symbolKey(base, renames)))
  );
}

export function matchAnchoredFindings({
  headFindings,
  baseFindings,
  snapshots,
  renames,
  touchedCode,
}) {
  const symbols = {
    base: symbolsOf(snapshots.base, renames),
    head: symbolsOf(snapshots.head, new Map()),
  };
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
    const candidates = baseByAnchor.get(anchorKey(head, new Map())) ?? [];
    const index = candidates.findIndex((base) => symbolMoved({ head, base }, { renames, symbols }));
    if (index !== -1) {
      pairs.push({ head, base: candidates.splice(index, 1)[0] });
    }
  }
  return pairs;
}
