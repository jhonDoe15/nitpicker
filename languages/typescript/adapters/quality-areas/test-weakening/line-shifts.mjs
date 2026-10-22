import { diffAgainstBase } from '../runners/mutation-scope.mjs';

const HUNK_HEADER = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gmu;
const TARGET_PATH = /^\+\+\+ (?:b\/)?(.+)$/mu;

function hunksOf(section) {
  return [...section.matchAll(HUNK_HEADER)].map((match) => ({
    baseCount: match[1] === undefined ? 1 : Number(match[1]),
    headStart: Number(match[2]),
    headCount: match[3] === undefined ? 1 : Number(match[3]),
  }));
}

export function parseLineShifts(diff) {
  return new Map(
    diff
      .split(/^(?=diff --git )/mu)
      .map((section) => [TARGET_PATH.exec(section)?.[1], hunksOf(section)])
      .filter(([filePath]) => filePath !== undefined && filePath !== '/dev/null'),
  );
}

export function sourceLineShifts(options) {
  return parseLineShifts(diffAgainstBase(options, '--unified=0'));
}

export function baseLineOf(hunks, line) {
  const isWritten = hunks.some(
    ({ headStart, headCount }) => line >= headStart && line < headStart + headCount,
  );
  if (isWritten) {
    return undefined;
  }
  return hunks
    .filter(({ headStart, headCount }) => line >= headStart + Math.max(headCount, 1))
    .reduce((mapped, { baseCount, headCount }) => mapped + baseCount - headCount, line);
}
