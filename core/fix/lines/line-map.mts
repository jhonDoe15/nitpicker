export type LineSpan = readonly [number, number];

export type Block = { readonly before: LineSpan; readonly after: LineSpan };

const MAX_CELLS = 4_000_000;

function commonPrefix(left: readonly string[], right: readonly string[]): number {
  const limit = Math.min(left.length, right.length);
  let count = 0;
  while (count < limit && left[count] === right[count]) {
    count += 1;
  }
  return count;
}

function commonSuffix(left: readonly string[], right: readonly string[], skip: number): number {
  const limit = Math.min(left.length, right.length) - skip;
  let count = 0;
  while (count < limit && left.at(-1 - count) === right.at(-1 - count)) {
    count += 1;
  }
  return count;
}

function commonLengths(left: readonly string[], right: readonly string[]): Uint32Array {
  const width = right.length + 1;
  const lengths = new Uint32Array((left.length + 1) * width);
  for (let row = left.length - 1; row >= 0; row -= 1) {
    for (let column = right.length - 1; column >= 0; column -= 1) {
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

type Walk = { row: number; column: number; open: { row: number; column: number } | undefined };

function closeBlock(walk: Walk, offset: number, blocks: Block[]): void {
  if (walk.open !== undefined) {
    blocks.push({
      before: [offset + walk.open.row + 1, offset + walk.row],
      after: [offset + walk.open.column + 1, offset + walk.column],
    });
    walk.open = undefined;
  }
}

function skipsLeft(walk: Walk, sides: Sides, lengths: Uint32Array): boolean {
  const { left, right } = sides;
  const width = right.length + 1;
  const down = walk.row < left.length ? (lengths[(walk.row + 1) * width + walk.column] ?? 0) : -1;
  const across =
    walk.column < right.length ? (lengths[walk.row * width + walk.column + 1] ?? 0) : -1;
  return down >= across;
}

type Sides = { readonly left: readonly string[]; readonly right: readonly string[] };

function walkedBlocks(sides: Sides, offset: number): Block[] {
  const { left, right } = sides;
  const lengths = commonLengths(left, right);
  const blocks: Block[] = [];
  const walk: Walk = { row: 0, column: 0, open: undefined };
  while (walk.row < left.length || walk.column < right.length) {
    const same =
      walk.row < left.length && walk.column < right.length && left[walk.row] === right[walk.column];
    if (same) {
      closeBlock(walk, offset, blocks);
      walk.row += 1;
      walk.column += 1;
    } else {
      walk.open ??= { row: walk.row, column: walk.column };
      if (skipsLeft(walk, sides, lengths)) {
        walk.row += 1;
      } else {
        walk.column += 1;
      }
    }
  }
  closeBlock(walk, offset, blocks);
  return blocks;
}

function middleBlocks(left: readonly string[], right: readonly string[], offset: number): Block[] {
  if (left.length * right.length > MAX_CELLS) {
    return [
      { before: [offset + 1, offset + left.length], after: [offset + 1, offset + right.length] },
    ];
  }
  return walkedBlocks({ left, right }, offset);
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
  const prefix = commonPrefix(left, right);
  const suffix = commonSuffix(left, right, prefix);
  return middleBlocks(
    left.slice(prefix, left.length - suffix),
    right.slice(prefix, right.length - suffix),
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
  const starts = [0];
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) {
    starts.push(index + 1);
  }
  return starts;
}

export function lineAt(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((starts[middle] ?? 0) <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low + 1;
}

export function overlaps(left: LineSpan, right: LineSpan, slack = 0): boolean {
  return left[0] <= right[1] + slack && right[0] <= left[1] + slack;
}
