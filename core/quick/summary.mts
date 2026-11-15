import { type Ctx, type Quick, type Result, summaryOf } from './summary-view.mts';

const ADVICE = 'Run nitpicker without --quick before you finish.';

export function quickSummary(skipped: readonly string[]): Quick {
  const what =
    skipped.length === 0
      ? 'no checks to skip in this configuration.'
      : `skipped ${skipped.join(', ')}.`;
  return { skipped, message: `Quick run: ${what} ${ADVICE}` };
}

export function runProfileSummary({ quick, staged }: Ctx): Result {
  return {
    mode: quick === undefined ? 'full' : 'quick',
    ...(quick === undefined ? {} : { quick }),
    ...(staged === true ? { staged: true } : {}),
  };
}

const STAGED_LINE =
  'Staged run: the head is the index. Unstaged edits and untracked files are not judged.';

export function stagedLines(summary: unknown): string[] {
  return summaryOf(summary).staged === true ? [STAGED_LINE] : [];
}

export function stagedHeader(summary: unknown): string {
  return stagedLines(summary)
    .map((line) => `${line}\n`)
    .join('');
}

export function quickLines(summary: unknown): string[] {
  const { quick } = summaryOf(summary);
  return quick === undefined ? [] : [quick.message];
}
