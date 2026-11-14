import { fieldOf, textOf } from '../../../../shared/values/readers.mts';

type Named = { readonly name: string };

export type PartialRun = {
  readonly ran: string[];
  readonly skipped: string[];
  readonly message: string;
};

const ADVICE = 'Run nitpicker without --analyzer before you finish.';

export function partialRunOf(
  analyzerNames: readonly unknown[],
  configured: readonly Named[],
  selected: readonly Named[],
): PartialRun | undefined {
  if (analyzerNames.length === 0 || selected.length === configured.length) {
    return undefined;
  }
  const ran = selected.map(({ name }) => name);
  const skipped = configured.map(({ name }) => name).filter((name) => !ran.includes(name));
  return { ran, skipped, message: `Ran only: ${ran.join(', ')}. ${ADVICE}` };
}

export function partialRunField(partialRun: unknown): object {
  return partialRun === undefined ? {} : { partialRun };
}

export function partialRunLines(summary: unknown): string[] {
  const partialRun = fieldOf(summary, 'partialRun');
  return partialRun === undefined ? [] : [textOf(fieldOf(partialRun, 'message'))];
}
