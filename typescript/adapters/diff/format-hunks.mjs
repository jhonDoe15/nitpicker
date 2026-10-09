const MAX_TABLE_CELLS = 40_000_000;

export function formattingHunks(source, formatted) {
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

function commonPrefixLength(left, right) {
  const shorter = Math.min(left.length, right.length);
  const firstDifference = indexesFrom(0, shorter).find((index) => left[index] !== right[index]);
  return firstDifference ?? shorter;
}

function alignedRuns(left, right) {
  if (left.length * right.length > MAX_TABLE_CELLS) {
    return [{ leftStart: 0, original: left, formatted: right }];
  }
  return groupedRuns(editSteps(left, right, commonSubsequenceLengths(left, right)));
}

function commonSubsequenceLengths(left, right) {
  const width = right.length + 1;
  const table = new Uint32Array((left.length + 1) * width);
  for (const row of indexesFrom(0, left.length).toReversed()) {
    for (const column of indexesFrom(0, right.length).toReversed()) {
      table[row * width + column] =
        left[row] === right[column]
          ? table[(row + 1) * width + column + 1] + 1
          : Math.max(table[(row + 1) * width + column], table[row * width + column + 1]);
    }
  }
  return (row, column) => table[row * width + column];
}

function editSteps(left, right, lengthAt) {
  const steps = [];
  let column = 0;
  for (const [row, line] of left.entries()) {
    for (const candidate of indexesFrom(column, right.length)) {
      if (
        line === right[candidate] ||
        lengthAt(row + 1, candidate) >= lengthAt(row, candidate + 1)
      ) {
        break;
      }
      steps.push({ kind: 'insert', row, line: right[candidate] });
      column = candidate + 1;
    }
    const matches = column < right.length && line === right[column];
    steps.push({ kind: matches ? 'keep' : 'delete', row, line });
    column += matches ? 1 : 0;
  }
  for (const candidate of indexesFrom(column, right.length)) {
    steps.push({ kind: 'insert', row: left.length, line: right[candidate] });
  }
  return steps;
}

function groupedRuns(steps) {
  const runs = [];
  let current;
  for (const step of steps) {
    if (step.kind === 'keep') {
      current = undefined;
      continue;
    }
    current ??= runs[runs.push({ leftStart: step.row, original: [], formatted: [] }) - 1];
    (step.kind === 'delete' ? current.original : current.formatted).push(step.line);
  }
  return runs;
}

function indexesFrom(first, end) {
  return Array.from({ length: Math.max(end - first, 0) }, (_, offset) => first + offset);
}
