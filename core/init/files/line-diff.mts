type Cursor = { readonly row: number; readonly column: number };

type Sides = {
  readonly before: readonly string[];
  readonly after: readonly string[];
  readonly table: readonly (readonly number[])[];
};

type Step = { readonly operation: string; readonly next: Cursor };

type Position = { readonly operation: string; readonly before: number; readonly after: number };

const MAX_TABLE_CELLS = 4_000_000;
const CONTEXT_LINES = 3;

function linesOf(text: string): string[] {
  return text === '' ? [] : text.replace(/\n$/u, '').split('\n');
}

function commonLengths(before: readonly string[], after: readonly string[]): number[][] {
  const rows: number[][] = [Array.from({ length: after.length + 1 }, () => 0)];
  for (const line of [...before].reverse()) {
    const below = rows[0] ?? [];
    const row = Array.from({ length: after.length + 1 }, () => 0);
    for (const column of [...after.keys()].reverse()) {
      row[column] =
        line === after[column]
          ? (below[column + 1] ?? 0) + 1
          : Math.max(below[column] ?? 0, row[column + 1] ?? 0);
    }
    rows.unshift(row);
  }
  return rows;
}

function nextStep({ before, after, table }: Sides, { row, column }: Cursor): Step {
  if (row === before.length) {
    return { operation: `+${after[column] ?? ''}`, next: { row, column: column + 1 } };
  }
  const removal = { operation: `-${before[row] ?? ''}`, next: { row: row + 1, column } };
  if (column === after.length) {
    return removal;
  }
  if (before[row] === after[column]) {
    return { operation: ` ${before[row] ?? ''}`, next: { row: row + 1, column: column + 1 } };
  }
  const addition = { operation: `+${after[column] ?? ''}`, next: { row, column: column + 1 } };
  return (table[row + 1]?.[column] ?? 0) >= (table[row]?.[column + 1] ?? 0) ? removal : addition;
}

function walk(sides: Sides): string[] {
  const operations: string[] = [];
  const cursors: Cursor[] = [{ row: 0, column: 0 }];
  for (const cursor of cursors) {
    if (cursor.row === sides.before.length && cursor.column === sides.after.length) {
      break;
    }
    const { operation, next } = nextStep(sides, cursor);
    operations.push(operation);
    cursors.push(next);
  }
  return operations;
}

function operationsBetween(before: readonly string[], after: readonly string[]): string[] {
  if ((before.length + 1) * (after.length + 1) > MAX_TABLE_CELLS) {
    return [...before.map((line) => `-${line}`), ...after.map((line) => `+${line}`)];
  }
  return walk({ before, after, table: commonLengths(before, after) });
}

function positioned(operations: readonly string[]): Position[] {
  const counter = { before: 1, after: 1 };
  const positions: Position[] = [];
  for (const operation of operations) {
    positions.push({ operation, before: counter.before, after: counter.after });
    counter.before += operation.startsWith('+') ? 0 : 1;
    counter.after += operation.startsWith('-') ? 0 : 1;
  }
  return positions;
}

function keptIndices(positions: readonly Position[]): number[] {
  const changed = positions.flatMap((position, index) =>
    position.operation.startsWith(' ') ? [] : [index],
  );
  const near = changed.flatMap((index) =>
    Array.from({ length: CONTEXT_LINES * 2 + 1 }, (_, offset) => index - CONTEXT_LINES + offset),
  );
  return [...new Set(near)]
    .filter((index) => index >= 0 && index < positions.length)
    .toSorted((first, second) => first - second);
}

function hunkGroups(indices: readonly number[]): number[][] {
  const groups: number[][] = [];
  for (const index of indices) {
    const last = groups.at(-1);
    if (last !== undefined && last.at(-1) === index - 1) {
      last.push(index);
    } else {
      groups.push([index]);
    }
  }
  return groups;
}

function rangeOf(start: number, count: number): string {
  return `${String(count === 0 ? start - 1 : start)},${String(count)}`;
}

function hunk(positions: readonly Position[], group: readonly number[]): string[] {
  const lines = group.flatMap((index) => positions[index] ?? []);
  const first = lines[0] ?? { operation: '', before: 1, after: 1 };
  const before = lines.filter(({ operation }) => !operation.startsWith('+')).length;
  const after = lines.filter(({ operation }) => !operation.startsWith('-')).length;
  return [
    `@@ -${rangeOf(first.before, before)} +${rangeOf(first.after, after)} @@`,
    ...lines.map(({ operation }) => operation),
  ];
}

export function unifiedDiff({
  name,
  before,
  after,
}: {
  readonly name: string;
  readonly before: string;
  readonly after: string;
}): string {
  const positions = positioned(operationsBetween(linesOf(before), linesOf(after)));
  const hunks = hunkGroups(keptIndices(positions)).flatMap((group) => hunk(positions, group));
  return [`--- ${name}`, `+++ ${name} (nitpicker init)`, ...hunks, ''].join('\n');
}
