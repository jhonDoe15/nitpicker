import { comparisonKey } from '../fingerprint.mjs';
import { baseLineOf, headLineOf } from '../../git/unchanged-lines.mjs';

const NUMBERED = /#\d+$/u;
const COUNTED = /([|:]occurrence:)\d+/u;

function occurrenceStem(identity) {
  return identity.replace(NUMBERED, '').replace(COUNTED, '$1');
}

function groupFindings(groups, findings, { side, renames, directories }) {
  for (const finding of findings) {
    const key = comparisonKey(
      { ...finding, identity: occurrenceStem(finding.identity) },
      renames,
      directories,
    );
    const group = groups.get(key) ?? { base: [], head: [] };
    group[side].push(finding);
    groups.set(key, group);
  }
}

function lineOf(finding) {
  return finding.location?.line;
}

function anchoredPairs(group, file) {
  const pairs = new Map();
  const free = new Set(group.base);
  const byLine = Map.groupBy(group.base, lineOf);
  for (const head of group.head) {
    const baseLine = baseLineOf(file, lineOf(head));
    const base = (byLine.get(baseLine) ?? []).find((candidate) => free.has(candidate));
    if (base !== undefined) {
      pairs.set(head, base);
      free.delete(base);
    }
  }
  return { pairs, free };
}

const MAX_NEAREST_CANDIDATES = 250_000;

function inLineOrder(heads, bases) {
  const ordered = bases.toSorted((left, right) => left.line - right.line);
  return heads
    .toSorted((left, right) => lineOf(left) - lineOf(right))
    .slice(0, ordered.length)
    .map((head, index) => ({ head, base: ordered[index].base }));
}

function nearestCandidates(heads, free, file) {
  const bases = [...free].map((base) => ({ base, line: headLineOf(file, lineOf(base)) }));
  if (heads.length * bases.length > MAX_NEAREST_CANDIDATES) {
    return inLineOrder(heads, bases);
  }
  return heads
    .flatMap((head) =>
      bases.map(({ base, line }) => ({ head, base, distance: Math.abs(lineOf(head) - line) })),
    )
    .toSorted((left, right) => left.distance - right.distance);
}

function pairByPosition(group, { file, renames, directories }) {
  const { pairs, free } = anchoredPairs(group, file);
  const heads = group.head.filter((head) => !pairs.has(head));
  for (const { head, base } of nearestCandidates(heads, free, file)) {
    if (!pairs.has(head) && free.has(base)) {
      pairs.set(head, base);
      free.delete(base);
    }
  }
  return group.head.map((head) => [
    head,
    pairs.has(head)
      ? comparisonKey(pairs.get(head), renames, directories)
      : comparisonKey({ ...head, identity: `${head.identity}\0unpaired` }),
  ]);
}

function isPositioned(group) {
  return [...group.base, ...group.head].every((finding) => lineOf(finding) !== undefined);
}

export function pairedKeys({ baseFindings, headFindings, renames, directories, touchedCode }) {
  const groups = new Map();
  groupFindings(groups, baseFindings, { side: 'base', renames, directories });
  groupFindings(groups, headFindings, { side: 'head', renames: new Map(), directories: new Map() });
  return new Map(
    [...groups.values()]
      .filter((group) => group.head.length > 0 && group.base.length > 0 && isPositioned(group))
      .flatMap((group) =>
        pairByPosition(group, {
          file: touchedCode?.changedLines.get(group.head[0].path),
          renames,
          directories,
        }),
      ),
  );
}
