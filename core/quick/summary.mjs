const ADVICE = 'Run nitpicker without --quick before you finish.';

export function quickSummary(skipped) {
  const what =
    skipped.length === 0
      ? 'no checks to skip in this configuration.'
      : `skipped ${skipped.join(', ')}.`;
  return { skipped, message: `Quick run: ${what} ${ADVICE}` };
}

export function quickLines(summary) {
  return summary?.quick === undefined ? [] : [summary.quick.message];
}
