import { comparisonKey } from '../fingerprint.mjs';
import { normalizeGitPath } from '../../git/normalize.mjs';
import { lineMapOf } from '../../git/unchanged-lines.mjs';

const NUMBERED = /#\d+$/u;
const COUNTED = /([|:]occurrence:)\d+/u;

function occurrenceStem(identity) {
  return identity.replace(NUMBERED, '').replace(COUNTED, '$1');
}

function groupFindings(groups, findings, { side, moves }) {
  for (const finding of findings) {
    const key = comparisonKey({ ...finding, identity: occurrenceStem(finding.identity) }, moves);
    const group = groups.get(key) ?? { base: [], head: [] };
    group[side].push(finding);
    groups.set(key, group);
  }
}

function lineOf(finding) {
  return finding.location?.line;
}

function anchoredPairs(group, lines) {
  const pairs = new Map();
  const free = new Set(group.base);
  const byLine = Map.groupBy(group.base, lineOf);
  for (const head of group.head) {
    const baseLine = lines.baseLineOf(lineOf(head));
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

function nearestCandidates(heads, free, lines) {
  const bases = [...free].map((base) => ({ base, line: lines.headLineOf(lineOf(base)) }));
  if (heads.length * bases.length > MAX_NEAREST_CANDIDATES) {
    return inLineOrder(heads, bases);
  }
  return heads
    .flatMap((head) =>
      bases.map(({ base, line }) => ({ head, base, distance: Math.abs(lineOf(head) - line) })),
    )
    .toSorted((left, right) => left.distance - right.distance);
}

function isLegacyTwinElsewhere(head, base, lines) {
  return (
    lines.isOutsideHunks(lineOf(base), 'base') &&
    lines.hasSameText(
      { line: lineOf(head), column: columnOf(head, base) },
      { line: lineOf(base), column: columnOf(base, head) },
    )
  );
}

function columnOf(finding, other) {
  return other.location.column === undefined ? undefined : finding.location.column;
}

function isNewOnUnchangedLine(head, { file, occupied, legacy }) {
  const line = lineOf(head);
  return (
    file.changed !== undefined &&
    !file.changed.added &&
    file.lines.isOutsideHunks(line) &&
    !occupied.get(fileKey(head.tool, head.path))?.has(file.lines.baseLineOf(line)) &&
    legacy.some((base) => isLegacyTwinElsewhere(head, base, file.lines))
  );
}

function pairByPosition(group, { file, moves, occupied }) {
  const { pairs, free } = anchoredPairs(group, file.lines);
  const legacy = [...free];
  const heads = group.head.filter(
    (head) => !pairs.has(head) && !isNewOnUnchangedLine(head, { file, occupied, legacy }),
  );
  for (const { head, base } of nearestCandidates(heads, free, file.lines)) {
    if (!pairs.has(head) && free.has(base)) {
      pairs.set(head, base);
      free.delete(base);
    }
  }
  return group.head.map((head) => [
    head,
    pairs.has(head)
      ? comparisonKey(pairs.get(head), moves)
      : comparisonKey({ ...head, identity: `${head.identity}\0unpaired` }),
  ]);
}

function isPositioned(group) {
  return [...group.base, ...group.head].every((finding) => lineOf(finding) !== undefined);
}

function fileKey(tool, path) {
  return JSON.stringify([tool, normalizeGitPath(path)]);
}

function occupiedBaseLines(baseFindings, moves) {
  const occupied = new Map();
  for (const finding of baseFindings.filter((candidate) => lineOf(candidate) !== undefined)) {
    const path = normalizeGitPath(finding.path);
    const key = fileKey(finding.tool, moves.files.get(path) ?? path);
    occupied.set(key, (occupied.get(key) ?? new Set()).add(lineOf(finding)));
  }
  return occupied;
}

export function pairedKeys({ baseFindings, headFindings, moves, touchedCode }) {
  const groups = new Map();
  groupFindings(groups, baseFindings, { side: 'base', moves });
  groupFindings(groups, headFindings, { side: 'head' });
  const paired = [...groups.values()].filter(
    (group) => group.head.length > 0 && group.base.length > 0 && isPositioned(group),
  );
  const files = new Map(
    [...new Set(paired.map((group) => group.head[0].path))].map((path) => {
      const changed = touchedCode?.changedLines.get(path);
      return [path, { changed, lines: lineMapOf(changed) }];
    }),
  );
  const occupied = occupiedBaseLines(baseFindings, moves);
  return new Map(
    paired.flatMap((group) =>
      pairByPosition(group, { file: files.get(group.head[0].path), moves, occupied }),
    ),
  );
}
