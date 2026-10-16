import { baseLineOf, canMapLines } from '../../git/patches/line-map.mjs';
import { comparisonKey } from '../fingerprint.mjs';

const OCCURRENCE = /^(.*)#(\d+)$/s;

function stem(identity) {
  return OCCURRENCE.exec(identity)?.[1] ?? identity;
}

function occurrence(identity) {
  return Number(OCCURRENCE.exec(identity)?.[2] ?? 1);
}

function groupBy(findings, keyOf) {
  const groups = new Map();
  for (const finding of findings) {
    const key = keyOf({ ...finding, identity: stem(finding.identity) });
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  return groups;
}

function byLine(left, right) {
  return left.location.line - right.location.line;
}

function pairsOf(heads, bases, changed) {
  const pairs = new Map();
  for (const head of heads) {
    const baseLine = baseLineOf(changed, head.location.line);
    const base = bases.find(
      (candidate) =>
        candidate.location.line === baseLine && ![...pairs.values()].includes(candidate),
    );
    if (base !== undefined) {
      pairs.set(head, base);
    }
  }
  const leftBases = bases.filter((base) => ![...pairs.values()].includes(base)).toSorted(byLine);
  const leftHeads = heads.filter((head) => !pairs.has(head)).toSorted(byLine);
  for (const [index, head] of leftHeads.slice(0, leftBases.length).entries()) {
    pairs.set(head, leftBases[index]);
  }
  return pairs;
}

function realigned(heads, bases, changed) {
  const pairs = pairsOf(heads, bases, changed);
  let next = Math.max(...[...heads, ...bases].map((finding) => occurrence(finding.identity))) + 1;
  return heads.map((head) => {
    const identity = pairs.get(head)?.identity ?? `${stem(head.identity)}#${String(next++)}`;
    return [head, { ...head, identity }];
  });
}

function canRealign(heads, bases, changed) {
  return (
    bases.length > 0 &&
    heads.length + bases.length > 2 &&
    canMapLines(changed) &&
    [...heads, ...bases].every((finding) => finding.location?.line !== undefined)
  );
}

export function alignOccurrences(
  baseFindings,
  headFindings,
  { renames, directories, touchedCode },
) {
  if (touchedCode === undefined) {
    return headFindings;
  }
  const baseGroups = groupBy(baseFindings, (finding) =>
    comparisonKey(finding, renames, directories),
  );
  const replaced = new Map(
    [...groupBy(headFindings, (finding) => comparisonKey(finding))].flatMap(([key, heads]) => {
      const bases = baseGroups.get(key) ?? [];
      const changed = touchedCode.changedLines.get(heads[0].path);
      return canRealign(heads, bases, changed) ? realigned(heads, bases, changed) : [];
    }),
  );
  return headFindings.map((finding) => replaced.get(finding) ?? finding);
}
