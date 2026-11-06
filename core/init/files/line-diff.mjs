const MAX_TABLE_CELLS = 4_000_000;
const CONTEXT_LINES = 3;

function linesOf(text) {
  return text === '' ? [] : text.replace(/\n$/u, '').split('\n');
}

function commonLengths(before, after) {
  const rows = [new Array(after.length + 1).fill(0)];
  for (const line of [...before].reverse()) {
    const below = rows[0];
    const row = new Array(after.length + 1).fill(0);
    for (const column of [...after.keys()].reverse()) {
      row[column] =
        line === after[column] ? below[column + 1] + 1 : Math.max(below[column], row[column + 1]);
    }
    rows.unshift(row);
  }
  return rows;
}

function nextStep({ before, after, table }, { row, column }) {
  if (row === before.length) {
    return { operation: `+${after[column]}`, next: { row, column: column + 1 } };
  }
  const removal = { operation: `-${before[row]}`, next: { row: row + 1, column } };
  if (column === after.length) {
    return removal;
  }
  if (before[row] === after[column]) {
    return { operation: ` ${before[row]}`, next: { row: row + 1, column: column + 1 } };
  }
  const addition = { operation: `+${after[column]}`, next: { row, column: column + 1 } };
  return table[row + 1][column] >= table[row][column + 1] ? removal : addition;
}

function walk(sides) {
  const operations = [];
  const cursors = [{ row: 0, column: 0 }];
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

function operationsBetween(before, after) {
  if ((before.length + 1) * (after.length + 1) > MAX_TABLE_CELLS) {
    return [...before.map((line) => `-${line}`), ...after.map((line) => `+${line}`)];
  }
  return walk({ before, after, table: commonLengths(before, after) });
}

function positioned(operations) {
  const counter = { before: 1, after: 1 };
  const positions = [];
  for (const operation of operations) {
    positions.push({ operation, before: counter.before, after: counter.after });
    counter.before += operation.startsWith('+') ? 0 : 1;
    counter.after += operation.startsWith('-') ? 0 : 1;
  }
  return positions;
}

function keptIndices(positions) {
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

function hunkGroups(indices) {
  const groups = [];
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

function rangeOf(start, count) {
  return `${String(count === 0 ? start - 1 : start)},${String(count)}`;
}

function hunk(positions, group) {
  const lines = group.map((index) => positions[index]);
  const first = lines[0];
  const before = lines.filter(({ operation }) => !operation.startsWith('+')).length;
  const after = lines.filter(({ operation }) => !operation.startsWith('-')).length;
  return [
    `@@ -${rangeOf(first.before, before)} +${rangeOf(first.after, after)} @@`,
    ...lines.map(({ operation }) => operation),
  ];
}

export function unifiedDiff({ name, before, after }) {
  const positions = positioned(operationsBetween(linesOf(before), linesOf(after)));
  const hunks = hunkGroups(keptIndices(positions)).flatMap((group) => hunk(positions, group));
  return [`--- ${name}`, `+++ ${name} (nitpicker init)`, ...hunks, ''].join('\n');
}
