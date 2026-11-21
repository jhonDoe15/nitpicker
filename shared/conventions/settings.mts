import { configError, isPlainObject } from '../config.mts';
import { textOf } from '../values/readers.mts';
import { didYouMean } from '../messages/closest-match.mts';
import type { Convention, DetectedEntry } from './convention-types.mts';

export const FUNCTION_NAME: RegExp = /^[A-Za-z_]\w*$/;

export const COLUMNS: { valuePattern: RegExp; unit: string; range: string } = {
  valuePattern: /^[1-9]\d{1,2}$/,
  unit: 'columns',
  range: 'a whole number from 10 to 999',
};

export function isValidChoice(definition: Convention | undefined, choice: unknown): boolean {
  return (
    definition?.kind === 'names' ||
    (typeof choice === 'string' && (definition?.options ?? []).includes(choice)) ||
    (definition?.valuePattern !== undefined &&
      typeof choice === 'string' &&
      definition.valuePattern.test(choice))
  );
}

function optionLabel(definition: Convention, choice: unknown): string {
  const unit = definition.unit === undefined ? '' : ` ${definition.unit}`;
  const key = textOf(choice);
  return definition.optionLabels?.[key] ?? `${key}${unit}`;
}

function validateChoice(definition: Convention, choice: unknown): void {
  if (definition.kind === 'names') {
    if (!(
      Array.isArray(choice) &&
      choice.every((name) => typeof name === 'string' && FUNCTION_NAME.test(name))
    )) {
      throw configError(`"conventions.${definition.id}" must be a list of function names`);
    }
    return;
  }
  if (!isValidChoice(definition, choice)) {
    const options = (definition.options ?? []).map((option) => `"${option}"`).join(', ');
    const other =
      definition.valuePattern === undefined
        ? ''
        : `, or another number of ${definition.unit ?? ''}`;
    throw configError(`"conventions.${definition.id}" must be one of: ${options}${other}`);
  }
}

export function validateConventions(value: unknown, definitions: readonly Convention[]): void {
  if (!isPlainObject(value)) {
    throw configError('"conventions" must be an object');
  }
  const known = new Map(
    definitions.map((definition): [string, Convention] => [definition.id, definition]),
  );
  for (const [id, choice] of Object.entries(value)) {
    const definition = known.get(id);
    if (definition === undefined) {
      throw configError(
        `unknown convention "${id}"${didYouMean(id, [...known.keys()]) || `. Allowed conventions: ${[...known.keys()].join(', ') || '(none for this preset)'}`}`,
      );
    }
    validateChoice(definition, choice);
  }
}

export function describeConventions(
  detected: Readonly<Record<string, DetectedEntry>>,
  definitions: readonly Convention[],
  note: (id: string, choice: unknown) => string | undefined = () => undefined,
): string[] {
  return definitions
    .filter(({ hidden }) => hidden !== true)
    .map((definition) =>
      describeOne(definition, detected[definition.id] ?? { choice: undefined }, note),
    );
}

function needed(definition: Convention, files: number | undefined): string {
  const minimum = String(definition.minFiles);
  return definition.minUnit === undefined
    ? `at least ${minimum} of ${String(files)} measured files`
    : `at least ${minimum} ${definition.minUnit} in ${String(files)} measured files`;
}

function describeOne(
  definition: Convention,
  { choice, source, counts = {}, files, from, overrides }: DetectedEntry,
  note: (id: string, choice: unknown) => string | undefined,
): string {
  if (Array.isArray(choice)) {
    const names = `${definition.label}: ${choice.join(', ')}`;
    return source === 'pinned'
      ? `${names} (set in nitpicker.config.json)`
      : `${names} (final call of ${needed(definition, files)})`;
  }
  const extra = note(definition.id, choice);
  const option = optionLabel(definition, choice);
  const label = `${definition.label}: ${option}${extra === undefined ? '' : `, ${extra}`}`;
  if (source === 'project') {
    const pin = overrides === undefined ? undefined : optionLabel(definition, overrides);
    const overridden =
      overrides === undefined
        ? ''
        : `, overriding the pin of ${pin ?? ''} in nitpicker.config.json`;
    return `${label} (from ${from ?? ''}${overridden})`;
  }
  if (source === 'pinned') {
    return `${label} (set in nitpicker.config.json)`;
  }
  const measured = Object.values(counts).reduce((total, count) => total + count, 0);
  return source === 'majority'
    ? `${label} (used by ${String(counts[textOf(choice)])} of ${String(measured)} measured files)`
    : `${label} (preset default; ${measured === 0 ? 'no files to measure' : 'no clear majority'})`;
}

export function ignoredChoiceNote(
  definition: Convention,
  { choice, from }: { readonly choice: unknown; readonly from: string },
): string {
  const allowed =
    definition.range ?? (definition.options ?? []).map((option) => `"${option}"`).join(', ');
  return `Ignoring the ${definition.label.toLowerCase()} of ${optionLabel(definition, choice)} from ${from}: it must be ${allowed}`;
}
