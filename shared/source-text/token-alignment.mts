import { whileHolds } from '../traversal.mts';
import type { AlignToken } from './typed/source-types.mts';

type Pair = [number, number];
type Point = { x: number; y: number };
type Sides<T> = { readonly left: readonly T[]; readonly right: readonly T[] };
type LineSpan = { line: number; start: number; end: number };
type Bounds = { readonly start: number; readonly end: number };

function reached(frontier: ReadonlyMap<number, number>, diagonal: number): number {
  return frontier.get(diagonal) ?? Number.NaN;
}

function startOfStep(
  frontier: ReadonlyMap<number, number>,
  diagonal: number,
  edits: number,
): { readonly previous: number; readonly x: number } {
  const fromAbove =
    diagonal === -edits ||
    (diagonal !== edits && reached(frontier, diagonal - 1) < reached(frontier, diagonal + 1));
  return fromAbove
    ? { previous: diagonal + 1, x: reached(frontier, diagonal + 1) }
    : { previous: diagonal - 1, x: reached(frontier, diagonal - 1) + 1 };
}

function followDiagonal(left: readonly string[], right: readonly string[], start: Point): Point {
  const end = { x: start.x, y: start.y };
  for (const current of whileHolds(
    end,
    ({ x, y }: Point) => x < left.length && y < right.length && left[x] === right[y],
  )) {
    current.x += 1;
    current.y += 1;
  }
  return end;
}

function diagonalsOf(edits: number): number[] {
  return Array.from({ length: edits + 1 }, (_, index) => 2 * index - edits);
}

function step(frontier: Map<number, number>, edits: number, sides: Sides<string>): boolean {
  for (const diagonal of diagonalsOf(edits)) {
    const { x } = startOfStep(frontier, diagonal, edits);
    const end = followDiagonal(sides.left, sides.right, { x, y: x - diagonal });
    frontier.set(diagonal, end.x);
    if (end.x >= sides.left.length && end.y >= sides.right.length) {
      return true;
    }
  }
  return false;
}

function backtrack(trace: readonly ReadonlyMap<number, number>[], sides: Sides<string>): Pair[] {
  const pairs: Pair[] = [];
  const cursor = { x: sides.left.length, y: sides.right.length };
  for (const [edits, frontier] of [...trace.entries()].reverse()) {
    const { previous } = startOfStep(frontier, cursor.x - cursor.y, edits);
    const previousX = edits === 0 ? 0 : reached(frontier, previous);
    const previousY = edits === 0 ? 0 : previousX - previous;
    for (const current of whileHolds(cursor, ({ x, y }: Point) => x > previousX && y > previousY)) {
      current.x -= 1;
      current.y -= 1;
      pairs.push([current.x, current.y]);
    }
    Object.assign(cursor, { x: previousX, y: previousY });
  }
  return pairs.reverse();
}

export function alignTokens(
  left: readonly string[],
  right: readonly string[],
  maxEdits: number,
): Pair[] | undefined {
  const sides = { left, right };
  const frontier = new Map<number, number>([[1, 0]]);
  const trace: Map<number, number>[] = [];
  const limit = Math.min(left.length + right.length, maxEdits);
  for (const edits of Array.from({ length: limit + 1 }, (_, index) => index)) {
    trace.push(new Map(frontier));
    if (step(frontier, edits, sides)) {
      return backtrack(trace, sides);
    }
  }
  return undefined;
}

function linesOf(tokens: readonly AlignToken[]): LineSpan[] {
  const lines: LineSpan[] = [];
  for (const [index, token] of tokens.entries()) {
    const last = lines.at(-1);
    if (last?.line === token.line) {
      last.end = index + 1;
    } else {
      lines.push({ line: token.line, start: index, end: index + 1 });
    }
  }
  return lines;
}

function lineKeys(tokens: readonly AlignToken[], lines: readonly LineSpan[]): string[] {
  return lines.map(({ start, end }) =>
    tokens
      .slice(start, end)
      .map(({ text }) => text)
      .join('\0'),
  );
}

function appendShifted(pairs: Pair[], shifted: readonly Pair[], offset: Pair): void {
  for (const [leftIndex, rightIndex] of shifted) {
    pairs.push([offset[0] + leftIndex, offset[1] + rightIndex]);
  }
}

function texts(tokens: readonly AlignToken[]): string[] {
  return tokens.map(({ text }) => text);
}

function gapPairs(
  sides: Sides<AlignToken> & { readonly maxEdits: number },
  from: Pair,
  to: Pair,
): Pair[] {
  const left = texts(sides.left.slice(from[0], to[0]));
  const right = texts(sides.right.slice(from[1], to[1]));
  return alignTokens(left, right, sides.maxEdits) ?? [];
}

function boundaries(lines: readonly LineSpan[], index: number, total: number): Bounds {
  return { start: lines[index]?.start ?? total, end: lines[index]?.end ?? total };
}

type LineStep = {
  readonly sides: Sides<AlignToken> & { readonly maxEdits: number };
  readonly leftLines: readonly LineSpan[];
  readonly rightLines: readonly LineSpan[];
  readonly linePair: Pair;
};

function appendLinePair(pairs: Pair[], previous: Pair, step: LineStep): void {
  const { sides, leftLines, rightLines, linePair } = step;
  const bounds = {
    left: boundaries(leftLines, linePair[0], sides.left.length),
    right: boundaries(rightLines, linePair[1], sides.right.length),
  };
  appendShifted(
    pairs,
    gapPairs(sides, previous, [bounds.left.start, bounds.right.start]),
    previous,
  );
  for (const offset of Array.from({ length: bounds.left.end - bounds.left.start }).keys()) {
    pairs.push([bounds.left.start + offset, bounds.right.start + offset]);
  }
  previous.splice(0, 2, bounds.left.end, bounds.right.end);
}

function alignLines(
  left: readonly AlignToken[],
  right: readonly AlignToken[],
  maxEdits: number,
): Pair[] | undefined {
  const sides = { left, right, maxEdits };
  const leftLines = linesOf(left);
  const rightLines = linesOf(right);
  const linePairs = alignTokens(lineKeys(left, leftLines), lineKeys(right, rightLines), maxEdits);
  if (linePairs === undefined) {
    return undefined;
  }
  const pairs: Pair[] = [];
  const previous: Pair = [0, 0];
  const sentinel: Pair = [leftLines.length, rightLines.length];
  const context = { sides, leftLines, rightLines };
  for (const linePair of [...linePairs, sentinel]) {
    appendLinePair(pairs, previous, { ...context, linePair });
  }
  return pairs;
}

function commonEnds(
  left: readonly AlignToken[],
  right: readonly AlignToken[],
): { prefix: number; suffix: number } {
  const shorter = Math.min(left.length, right.length);
  const ends = { prefix: 0, suffix: 0 };
  for (const current of whileHolds(
    ends,
    ({ prefix }: { prefix: number }) =>
      prefix < shorter && left[prefix]?.text === right[prefix]?.text,
  )) {
    current.prefix += 1;
  }
  const room = shorter - ends.prefix;
  for (const current of whileHolds(
    ends,
    ({ suffix }: { suffix: number }) =>
      suffix < room && left.at(-1 - suffix)?.text === right.at(-1 - suffix)?.text,
  )) {
    current.suffix += 1;
  }
  return ends;
}

export function alignSequences(
  left: readonly AlignToken[],
  right: readonly AlignToken[],
  maxEdits: number,
): Pair[] | undefined {
  const { prefix, suffix } = commonEnds(left, right);
  const middle = {
    left: left.slice(prefix, left.length - suffix),
    right: right.slice(prefix, right.length - suffix),
  };
  const inner =
    alignTokens(texts(middle.left), texts(middle.right), maxEdits) ??
    alignLines(middle.left, middle.right, maxEdits);
  if (inner === undefined) {
    return undefined;
  }
  const pairs = Array.from({ length: prefix }, (_, index): Pair => [index, index]);
  appendShifted(pairs, inner, [prefix, prefix]);
  for (const offset of Array.from({ length: suffix }).keys()) {
    pairs.push([left.length - suffix + offset, right.length - suffix + offset]);
  }
  return pairs;
}
