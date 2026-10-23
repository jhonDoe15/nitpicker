const MAX_TABLE_CELLS = 4_000_000;

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

export function unifiedDiff({ name, before, after }) {
  const old = linesOf(before);
  const next = linesOf(after);
  const header = `--- ${name}\n+++ ${name} (nitpicker init)\n@@ -1,${String(old.length)} +1,${String(next.length)} @@\n`;
  return `${header}${operationsBetween(old, next).join('\n')}\n`;
}
