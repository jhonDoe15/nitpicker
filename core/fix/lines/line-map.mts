export type LineSpan = readonly [number, number];

export type Block = { readonly before: LineSpan; readonly after: LineSpan };

type Sides = { readonly left: readonly string[]; readonly right: readonly string[] };
type Walk = { row: number; column: number; open: { row: number; column: number } | undefined };

const MAX_CELLS = 4_000_000;

function descending(count: number): number[] {
  return Array.from({ length: count }, (_unused, index) => count - 1 - index);
}

function commonPrefix(left: readonly string[], right: readonly string[]): number {
  const differing = left.findIndex((line, index) => line !== right[index]);
  return differing === -1 ? left.length : differing;
}

function commonSuffix(left: readonly string[], right: readonly string[], skip: number): number {
  return commonPrefix(left.slice(skip).toReversed(), right.slice(skip).toReversed());
}

function commonLengths({ left, right }: Sides): Uint32Array {
  const width = right.length + 1;
  const lengths = new Uint32Array((left.length + 1) * width);
  const columns = descending(right.length);
  for (const row of descending(left.length)) {
    for (const column of columns) {
      lengths[row * width + column] =
        left[row] === right[column]
          ? (lengths[(row + 1) * width + column + 1] ?? 0) + 1
          : Math.max(
              lengths[(row + 1) * width + column] ?? 0,
              lengths[row * width + column + 1] ?? 0,
            );
    }
  }
  return lengths;
}

function closeBlock(walk: Walk, offset: number, blocks: Block[]): void {
  if (walk.open !== undefined) {
    blocks.push({
      before: [offset + walk.open.row + 1, offset + walk.row],
      after: [offset + walk.open.column + 1, offset + walk.column],
    });
    walk.open = undefined;
  }
}

function skipsLeft(walk: Walk, { left, right }: Sides, lengths: Uint32Array): boolean {
  const width = right.length + 1;
  const down = walk.row < left.length ? (lengths[(walk.row + 1) * width + walk.column] ?? 0) : -1;
  const across =
    walk.column < right.length ? (lengths[walk.row * width + walk.column + 1] ?? 0) : -1;
  return down >= across;
}

function sameAt(walk: Walk, { left, right }: Sides): boolean {
  return (
    walk.row < left.length && walk.column < right.length && left[walk.row] === right[walk.column]
  );
}

function step(walk: Walk, sides: Sides, lengths: Uint32Array): void {
  if (sameAt(walk, sides)) {
    walk.row += 1;
    walk.column += 1;
    return;
  }
  walk.open ??= { row: walk.row, column: walk.column };
  if (skipsLeft(walk, sides, lengths)) {
    walk.row += 1;
  } else {
    walk.column += 1;
  }
}

function walkedBlocks(sides: Sides, offset: number): Block[] {
  const lengths = commonLengths(sides);
  const blocks: Block[] = [];
  const walk: Walk = { row: 0, column: 0, open: undefined };
  const ended = (): boolean => walk.row >= sides.left.length && walk.column >= sides.right.length;
  const steps = [0];
  for (const taken of steps) {
    if (ended()) {
      break;
    }
    if (sameAt(walk, sides)) {
      closeBlock(walk, offset, blocks);
    }
    step(walk, sides, lengths);
    steps.push(taken + 1);
  }
  closeBlock(walk, offset, blocks);
  return blocks;
}

function middleBlocks(sides: Sides, offset: number): Block[] {
  const { left, right } = sides;
  if (left.length * right.length > MAX_CELLS) {
    return [
      { before: [offset + 1, offset + left.length], after: [offset + 1, offset + right.length] },
    ];
  }
  return walkedBlocks(sides, offset);
}

function sameLine(line: string): string {
  return line;
}

export function withoutLayout(line: string): string {
  return line.trim().replaceAll(/\s+/gu, ' ');
}

export function changedBlocks(
  before: string,
  after: string,
  comparable: (line: string) => string = sameLine,
): Block[] {
  if (before === after) {
    return [];
  }
  const left = before.split('\n').map(comparable);
  const right = after.split('\n').map(comparable);
  const prefix = Math.min(commonPrefix(left, right), right.length);
  const suffix = commonSuffix(left, right, prefix);
  return middleBlocks(
    {
      left: left.slice(prefix, left.length - suffix),
      right: right.slice(prefix, right.length - suffix),
    },
    prefix,
  );
}

export function beforeLines(blocks: readonly Block[], line: number, slack = 0): LineSpan {
  let shift = 0;
  for (const { before, after } of blocks) {
    if (line < after[0] - slack) {
      break;
    }
    if (line <= after[1] + slack) {
      return before;
    }
    shift = before[1] - after[1];
  }
  return [line + shift, line + shift];
}

export function lineStarts(text: string): number[] {
  return [0, ...Array.from(text.matchAll(/\n/gu), (match) => match.index + 1)];
}

export function lineAt(starts: readonly number[], offset: number): number {
  const spans: LineSpan[] = [[0, starts.length - 1]];
  for (const [low, high] of spans) {
    if (low >= high) {
      return low + 1;
    }
    const middle = Math.ceil((low + high) / 2);
    spans.push((starts[middle] ?? 0) <= offset ? [middle, high] : [low, middle - 1]);
  }
  return 1;
}

export function overlaps(left: LineSpan, right: LineSpan, slack = 0): boolean {
  return left[0] <= right[1] + slack && right[0] <= left[1] + slack;
}
