import type { QualityAreaOptions } from '../typed/area-types.mts';
import { diffAgainstBase } from '../runners/mutation-scope.mts';

export type Hunk = {
  readonly baseCount: number;
  readonly headStart: number;
  readonly headCount: number;
};

const HUNK_HEADER = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gmu;
const TARGET_PATH = /^\+\+\+ (?:b\/)?(.+)$/mu;

function hunksOf(section: string): Hunk[] {
  return [...section.matchAll(HUNK_HEADER)].map((match) => ({
    baseCount: match[1] === undefined ? 1 : Number(match[1]),
    headStart: Number(match[2]),
    headCount: match[3] === undefined ? 1 : Number(match[3]),
  }));
}

export function parseLineShifts(diff: string): Map<string, Hunk[]> {
  return new Map(
    diff.split(/^(?=diff --git )/mu).flatMap((section): [string, Hunk[]][] => {
      const filePath = TARGET_PATH.exec(section)?.[1];
      return filePath === undefined || filePath === '/dev/null'
        ? []
        : [[filePath, hunksOf(section)]];
    }),
  );
}

export function sourceLineShifts(options: QualityAreaOptions): Map<string, Hunk[]> {
  return parseLineShifts(diffAgainstBase(options, '--unified=0'));
}

export function baseLineOf(hunks: readonly Hunk[], line: number): number | undefined {
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
