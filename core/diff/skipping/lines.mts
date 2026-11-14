import { fieldOf, listOf, textOf } from '../../../shared/values/readers.mts';

const SHORT_SHA_LENGTH = 12;

function skippedLine(names: readonly unknown[]): string {
  return `Skipped ${names.map(textOf).join(', ')}: no changed file is in their inputs.`;
}

export function skippedLines(summary: unknown): string[] {
  const names = listOf(fieldOf(summary, 'skippedAnalyzers'));
  return names.length === 0 ? [] : [skippedLine(names)];
}

export function skippedSummary({
  skippedAnalyzers = [],
}: {
  readonly skippedAnalyzers?: readonly string[] | undefined;
}): { readonly skippedAnalyzers?: readonly string[] } {
  return skippedAnalyzers.length === 0 ? {} : { skippedAnalyzers };
}

export function unaffectedLine(summary: unknown, names: unknown): string {
  const short = textOf(fieldOf(summary, 'mergeBaseSha')).slice(0, SHORT_SHA_LENGTH);
  const base = textOf(fieldOf(summary, 'requestedBaseRef'));
  return `No analyzer reads the files changed since ${base} (${short}); skipped ${listOf(names).map(textOf).join(', ')}.`;
}
