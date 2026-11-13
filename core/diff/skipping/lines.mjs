const SHORT_SHA_LENGTH = 12;

function skippedLine(names) {
  return `Skipped ${names.join(', ')}: no changed file is in their inputs.`;
}

export function skippedLines(summary) {
  const names = summary?.skippedAnalyzers ?? [];
  return names.length === 0 ? [] : [skippedLine(names)];
}

export function skippedSummary({ skippedAnalyzers = [] }) {
  return skippedAnalyzers.length === 0 ? {} : { skippedAnalyzers };
}

export function unaffectedLine({ requestedBaseRef, mergeBaseSha }, names) {
  const short = mergeBaseSha.slice(0, SHORT_SHA_LENGTH);
  return `No analyzer reads the files changed since ${requestedBaseRef} (${short}); skipped ${names.join(', ')}.`;
}
