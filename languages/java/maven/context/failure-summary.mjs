const TEST_TOTALS = /^\[ERROR\] Tests run: \d+, Failures: \d+, Errors: \d+, Skipped: \d+\s*$/mu;
const FAILURE_LIST = /^\[ERROR\] (?:Failures|Errors):\s*$/mu;
const MAX_LINES = 40;
const MAX_LINE_LENGTH = 220;

function clip(line) {
  return line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}...` : line;
}

export function testFailureSummary(output) {
  const totals = TEST_TOTALS.exec(output);
  const list = FAILURE_LIST.exec(output);
  if (totals === null || list === null || list.index > totals.index) {
    return undefined;
  }
  const lines = output
    .slice(list.index, totals.index + totals[0].length)
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '');
  const shown = lines.slice(0, MAX_LINES).map(clip);
  return [...shown, ...(lines.length > MAX_LINES ? ['...'] : [])].join('\n');
}
