const MAX_TABLE_CELLS = 40_000_000;

export type FormattingHunk = {
  readonly line: number;
  readonly count: number;
  readonly original: string;
  readonly formatted: string;
};

type Run = {
  readonly leftStart: number;
  readonly original: string[];
  readonly formatted: string[];
};

type EditStep = {
  readonly kind: 'keep' | 'delete' | 'insert';
  readonly row: number;
  readonly line: string;
};

type LengthAt = (row: number, column: number) => number;

export function formattingHunks(source: string, formatted: string): FormattingHunk[] {
  const left = source.split('\n');
  const right = formatted.split('\n');
  const start = commonPrefixLength(left, right);
  const end = commonPrefixLength(left.slice(start).toReversed(), right.slice(start).toReversed());
  const changedLeft = left.slice(start, left.length - end);
  const changedRight = right.slice(start, right.length - end);
  if (changedLeft.length === 0 && changedRight.length === 0) return [];
  return alignedRuns(changedLeft, changedRight).map((run) => ({
    line: start + run.leftStart + 1,
    count: run.original.length,
    original: run.original.join('\n'),
    formatted: run.formatted.join('\n'),
  }));
}

function commonPrefixLength(left: readonly string[], right: readonly string[]): number {
  const shorter = Math.min(left.length, right.length);
  const firstDifference = indexesFrom(0, shorter).find((index) => left[index] !== right[index]);
  return firstDifference ?? shorter;
}

function alignedRuns(left: string[], right: string[]): Run[] {
  if (left.length * right.length > MAX_TABLE_CELLS) {
    return [{ leftStart: 0, original: left, formatted: right }];
  }
  return groupedRuns(editSteps(left, right, commonSubsequenceLengths(left, right)));
}

function commonSubsequenceLengths(left: readonly string[], right: readonly string[]): LengthAt {
  const width = right.length + 1;
  const table = new Uint32Array((left.length + 1) * width);
  function cell(row: number, column: number): number {
    return table[row * width + column] ?? 0;
  }
  for (const row of indexesFrom(0, left.length).toReversed()) {
    for (const column of indexesFrom(0, right.length).toReversed()) {
      table[row * width + column] =
        left[row] === right[column]
          ? cell(row + 1, column + 1) + 1
          : Math.max(cell(row + 1, column), cell(row, column + 1));
    }
  }
  return cell;
}

function editSteps(
  left: readonly string[],
  right: readonly string[],
  lengthAt: LengthAt,
): EditStep[] {
  const steps: EditStep[] = [];
  let column = 0;
  for (const [row, line] of left.entries()) {
    const insertions = insertionsBefore({ row, line, column }, right, lengthAt);
    steps.push(...insertions);
    column += insertions.length;
    const matches = column < right.length && line === right[column];
    steps.push({ kind: matches ? 'keep' : 'delete', row, line });
    column += matches ? 1 : 0;
  }
  for (const line of right.slice(column)) {
    steps.push({ kind: 'insert', row: left.length, line });
  }
  return steps;
}

function insertionsBefore(
  { row, line, column }: { readonly row: number; readonly line: string; readonly column: number },
  right: readonly string[],
  lengthAt: LengthAt,
): EditStep[] {
  const stop = indexesFrom(column, right.length).find(
    (candidate) =>
      line === right[candidate] || lengthAt(row + 1, candidate) >= lengthAt(row, candidate + 1),
  );
  return right
    .slice(column, stop ?? right.length)
    .map((inserted): EditStep => ({ kind: 'insert', row, line: inserted }));
}

function groupedRuns(steps: readonly EditStep[]): Run[] {
  const runs: Run[] = [];
  let current: Run | undefined;
  for (const step of steps) {
    if (step.kind === 'keep') {
      current = undefined;
      continue;
    }
    if (current === undefined) {
      current = { leftStart: step.row, original: [], formatted: [] };
      runs.push(current);
    }
    (step.kind === 'delete' ? current.original : current.formatted).push(step.line);
  }
  return runs;
}

function indexesFrom(first: number, end: number): number[] {
  return Array.from({ length: Math.max(end - first, 0) }, (_, offset) => first + offset);
}
