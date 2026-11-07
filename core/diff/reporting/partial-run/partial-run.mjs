const ADVICE = 'Run nitpicker without --analyzer before you finish.';

export function partialRunOf(analyzerNames, configured, selected) {
  if (analyzerNames.length === 0 || selected.length === configured.length) {
    return undefined;
  }
  const ran = selected.map(({ name }) => name);
  const skipped = configured.map(({ name }) => name).filter((name) => !ran.includes(name));
  return { ran, skipped, message: `Ran only: ${ran.join(', ')}. ${ADVICE}` };
}

export function partialRunField(partialRun) {
  return partialRun === undefined ? {} : { partialRun };
}

export function partialRunLines(summary) {
  return summary?.partialRun === undefined ? [] : [summary.partialRun.message];
}
