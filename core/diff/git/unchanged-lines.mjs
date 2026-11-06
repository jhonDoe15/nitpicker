import { sourceLanguage, sourceLines } from '../../../shared/source-text/format-tokens.mjs';
import { movedLines } from '../../../shared/source-text/scope-moves.mjs';
import { alignSequences } from '../../../shared/source-text/token-alignment.mjs';
import { chainOf } from '../../../shared/traversal.mjs';

const MAX_TOKEN_EDITS = 1000;
const MAX_HUNK_TOKENS = 50_000;

function linesIn({ start, count }) {
  return Array.from({ length: count }, (_, offset) => start + offset);
}

function hunkTokens(lines, side, moved) {
  const tokens = [];
  for (const line of linesIn(side).filter((candidate) => !moved.has(candidate))) {
    for (const text of lines[line]?.tokens ?? []) {
      tokens.push({ text, line });
    }
  }
  return tokens;
}

function rootOf(parent, node) {
  const path = chainOf(node, (current) => parent.get(current));
  for (const visited of path.slice(0, -1)) {
    parent.set(visited, path.at(-1));
  }
  return path.at(-1);
}

function join(parent, left, right) {
  const leftRoot = rootOf(parent, left);
  const rightRoot = rootOf(parent, right);
  if (leftRoot !== rightRoot) {
    parent.set(leftRoot, rightRoot);
  }
}

function unmatchedRoots(parent, tokens, { matched, side }) {
  return tokens
    .filter((_, index) => !matched.has(index))
    .map(({ line }) => rootOf(parent, `${side}${String(line)}`));
}

function lineOutcome(pairs, removed, added) {
  const parent = new Map();
  for (const [removedIndex, addedIndex] of pairs) {
    join(parent, `b${String(removed[removedIndex].line)}`, `h${String(added[addedIndex].line)}`);
  }
  const dirty = new Set([
    ...unmatchedRoots(parent, removed, {
      matched: new Set(pairs.map(([index]) => index)),
      side: 'b',
    }),
    ...unmatchedRoots(parent, added, {
      matched: new Set(pairs.map(([, index]) => index)),
      side: 'h',
    }),
  ]);
  const changed = new Set(
    added.map(({ line }) => line).filter((line) => dirty.has(rootOf(parent, `h${String(line)}`))),
  );
  const carried = new Map();
  for (const [removedIndex, addedIndex] of pairs) {
    const { line } = added[addedIndex];
    if (!changed.has(line) && !carried.has(line)) {
      carried.set(line, removed[removedIndex].line);
    }
  }
  return { changed, carried: [...carried] };
}

function alignHunk(hunk, { sides, moved }) {
  const removed = hunkTokens(sides.base, hunk.base, new Set(moved.values()));
  const added = hunkTokens(sides.head, hunk.head, moved);
  const pairs =
    removed.length + added.length > MAX_HUNK_TOKENS
      ? undefined
      : alignSequences(removed, added, MAX_TOKEN_EDITS);
  return pairs === undefined
    ? { changed: new Set(linesIn(hunk.head)), carried: [] }
    : lineOutcome(pairs, removed, added);
}

export function alignHunks(hunks, filePath, sources) {
  const language = sourceLanguage(filePath);
  if (language === undefined || sources === undefined || hunks.some((hunk) => !hunk.complete)) {
    return undefined;
  }
  const sides = {
    base: sourceLines(sources.base, language),
    head: sourceLines(sources.head, language),
  };
  if (sides.base === undefined || sides.head === undefined) {
    return undefined;
  }
  const moved = movedLines({ sides, ...hunkLines(hunks) });
  const outcomes = hunks.map((hunk) => alignHunk(hunk, { sides, moved }));
  return {
    changed: new Set(outcomes.flatMap(({ changed }) => [...changed])),
    carried: [...moved, ...outcomes.flatMap(({ carried }) => carried)].sort(
      ([left], [right]) => left - right,
    ),
  };
}

function hunkLines(hunks) {
  const headed = hunksOf({
    hunks: hunks.map(({ base, head }) => [base.start, base.count, head.start, head.count]),
  });
  return {
    inBase: new Set(hunks.flatMap(({ base }) => linesIn(base))),
    inHead: new Set(hunks.flatMap(({ head }) => linesIn(head))),
    anchorOf: (line) => line + shiftBefore(headed, line, 'base'),
  };
}

function shiftBefore(hunks, line, side) {
  const other = side === 'head' ? 'base' : 'head';
  return hunks
    .filter((hunk) => hunk[side].start + Math.max(hunk[side].count, 1) - 1 < line)
    .reduce((shift, hunk) => shift + hunk[other].count - hunk[side].count, 0);
}

function enclosingHunk(hunks, line, side) {
  return hunks.find(
    (hunk) =>
      hunk[side].count > 0 &&
      hunk[side].start <= line &&
      line < hunk[side].start + hunk[side].count,
  );
}

function hunksOf(file) {
  return (file.hunks ?? []).map(([baseStart, baseCount, headStart, headCount]) => ({
    base: { start: baseStart, count: baseCount },
    head: { start: headStart, count: headCount },
  }));
}

function baseLine({ hunks, headToBase }, line) {
  if (headToBase.has(line)) {
    return headToBase.get(line);
  }
  return enclosingHunk(hunks, line, 'head') === undefined
    ? line + shiftBefore(hunks, line, 'head')
    : undefined;
}

function headLine({ hunks, baseToHead }, line) {
  if (baseToHead.has(line)) {
    return baseToHead.get(line);
  }
  return enclosingHunk(hunks, line, 'base')?.head.start ?? line + shiftBefore(hunks, line, 'base');
}

export function lineMapOf(file) {
  const carried = file?.carried ?? [];
  const map = {
    hunks: hunksOf(file ?? {}),
    headToBase: new Map(carried),
    baseToHead: new Map(carried.toReversed().map(([head, base]) => [base, head])),
  };
  return {
    baseLineOf(line) {
      return baseLine(map, line);
    },
    headLineOf(line) {
      return headLine(map, line);
    },
  };
}
