import {
  changesQuoteStyle,
  formattingFree,
  lineTokens,
} from '../../../../shared/source-text/format-tokens.mjs';
import { alignLines } from '../../../../shared/source-text/token-alignment.mjs';

const MAX_TOKEN_EDITS = 1000;

function sideTokens(hunks, side, quoteAgnostic) {
  return formattingFree(
    hunks.flatMap((hunk) =>
      hunk[side].lines.flatMap((text, offset) =>
        lineTokens(text, { line: hunk[side].start + offset, quoteAgnostic }),
      ),
    ),
  );
}

function changedHeadLines(pairs, removed, added) {
  const matchedRemoved = new Set(pairs.map(([removedIndex]) => removedIndex));
  const matchedAdded = new Set(pairs.map(([, addedIndex]) => addedIndex));
  const partlyRemoved = new Set(
    removed.filter((_, index) => !matchedRemoved.has(index)).map(({ line }) => line),
  );
  return new Set([
    ...added.filter((_, index) => !matchedAdded.has(index)).map(({ line }) => line),
    ...pairs
      .filter(([removedIndex]) => partlyRemoved.has(removed[removedIndex].line))
      .map(([, addedIndex]) => added[addedIndex].line),
  ]);
}

export function alignHunks(hunks, filePath) {
  if (hunks.length === 0 || hunks.some((hunk) => !hunk.complete)) {
    return undefined;
  }
  const quoteAgnostic = changesQuoteStyle(filePath);
  const removed = sideTokens(hunks, 'base', quoteAgnostic);
  const added = sideTokens(hunks, 'head', quoteAgnostic);
  const pairs = alignLines(removed, added, MAX_TOKEN_EDITS);
  if (pairs === undefined) {
    return undefined;
  }
  const changed = changedHeadLines(pairs, removed, added);
  const carried = new Map(
    pairs
      .toReversed()
      .map(([removedIndex, addedIndex]) => [added[addedIndex].line, removed[removedIndex].line]),
  );
  return {
    changed,
    carried: [...carried]
      .filter(([line]) => !changed.has(line))
      .sort(([left], [right]) => left - right),
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

export function baseLineOf(file, line) {
  if (file === undefined) {
    return line;
  }
  const carried = (file.carried ?? []).find(([head]) => head === line);
  if (carried !== undefined) {
    return carried[1];
  }
  const hunks = hunksOf(file);
  return enclosingHunk(hunks, line, 'head') === undefined
    ? line + shiftBefore(hunks, line, 'head')
    : undefined;
}

export function headLineOf(file, line) {
  if (file === undefined) {
    return line;
  }
  const carried = (file.carried ?? []).find(([, base]) => base === line);
  if (carried !== undefined) {
    return carried[0];
  }
  const hunks = hunksOf(file);
  return enclosingHunk(hunks, line, 'base')?.head.start ?? line + shiftBefore(hunks, line, 'base');
}
