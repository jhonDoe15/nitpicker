const MAX_TABLE_CELLS = 40_000_000;

/**
 * Compares a file with its Prettier output line by line and returns one hunk per run of differing
 * lines: `line` is the first line of the run in the original file, `original` and `formatted` are
 * the run's own text, and `count` is how many original lines it spans (0 for a pure insertion).
 */
export function formattingHunks(source, formatted) {
  const left = source.split('\n');
  const right = formatted.split('\n');
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start += 1;
  let leftEnd = left.length;
  let rightEnd = right.length;
  while (leftEnd > start && rightEnd > start && left[leftEnd - 1] === right[rightEnd - 1]) {
    leftEnd -= 1;
    rightEnd -= 1;
  }
  if (leftEnd === start && rightEnd === start) return [];
  return alignedRuns(left.slice(start, leftEnd), right.slice(start, rightEnd)).map((run) => ({
    line: start + run.leftStart + 1,
    count: run.original.length,
    original: run.original.join('\n'),
    formatted: run.formatted.join('\n'),
  }));
}

function alignedRuns(left, right) {
  if (left.length * right.length > MAX_TABLE_CELLS) {
    return [{ leftStart: 0, original: left, formatted: right }];
  }
  const width = right.length + 1;
  const table = new Uint32Array((left.length + 1) * width);
  for (let row = left.length - 1; row >= 0; row -= 1) {
    for (let column = right.length - 1; column >= 0; column -= 1) {
      table[row * width + column] =
        left[row] === right[column]
          ? table[(row + 1) * width + column + 1] + 1
          : Math.max(table[(row + 1) * width + column], table[row * width + column + 1]);
    }
  }
  const runs = [];
  let current;
  let row = 0;
  let column = 0;
  while (row < left.length || column < right.length) {
    if (row < left.length && column < right.length && left[row] === right[column]) {
      current = undefined;
      row += 1;
      column += 1;
      continue;
    }
    current ??= runs[runs.push({ leftStart: row, original: [], formatted: [] }) - 1];
    const dropLeft =
      column >= right.length ||
      (row < left.length && table[(row + 1) * width + column] >= table[row * width + column + 1]);
    if (dropLeft) {
      current.original.push(left[row]);
      row += 1;
    } else {
      current.formatted.push(right[column]);
      column += 1;
    }
  }
  return runs;
}
