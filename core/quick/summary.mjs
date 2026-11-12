const ADVICE = 'Run nitpicker without --quick before you finish.';

export function quickSummary(skipped) {
  const what =
    skipped.length === 0
      ? 'no checks to skip in this configuration.'
      : `skipped ${skipped.join(', ')}.`;
  return { skipped, message: `Quick run: ${what} ${ADVICE}` };
}

export function runProfileSummary({ quick, staged }) {
  return {
    mode: quick === undefined ? 'full' : 'quick',
    ...(quick === undefined ? {} : { quick }),
    ...(staged === true ? { staged: true } : {}),
  };
}

const STAGED_LINE =
  'Staged run: the head is the index. Unstaged edits and untracked files are not judged.';

export function stagedLines(summary) {
  return summary?.staged === true ? [STAGED_LINE] : [];
}

export function stagedHeader(summary) {
  return stagedLines(summary)
    .map((line) => `${line}\n`)
    .join('');
}

export function quickLines(summary) {
  return summary?.quick === undefined ? [] : [summary.quick.message];
}
