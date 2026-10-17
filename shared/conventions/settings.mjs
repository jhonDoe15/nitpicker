import { configError, isPlainObject } from '../config.mjs';

const NAME = /^[A-Za-z_]\w*$/;

export const COLUMNS = { valuePattern: /^[1-9]\d{1,2}$/, unit: 'columns' };

export function isValidChoice(definition, choice) {
  return (
    definition.kind === 'names' ||
    definition.options.includes(choice) ||
    (definition.valuePattern !== undefined &&
      typeof choice === 'string' &&
      definition.valuePattern.test(choice))
  );
}

function optionLabel(definition, choice) {
  const unit = definition.unit === undefined ? '' : ` ${definition.unit}`;
  return definition.optionLabels[choice] ?? `${choice}${unit}`;
}

function validateChoice(id, choice, definition) {
  if (definition.kind === 'names') {
    if (
      !Array.isArray(choice) ||
      !choice.every((name) => typeof name === 'string' && NAME.test(name))
    ) {
      throw configError(`"conventions.${id}" must be a list of function names`);
    }
    return;
  }
  if (!isValidChoice(definition, choice)) {
    const options = definition.options.map((option) => `"${option}"`).join(', ');
    const other =
      definition.valuePattern === undefined ? '' : `, or another number of ${definition.unit}`;
    throw configError(`"conventions.${id}" must be one of: ${options}${other}`);
  }
}

export function validateConventions(value, definitions) {
  if (!isPlainObject(value)) {
    throw configError('"conventions" must be an object');
  }
  const known = new Map(definitions.map((definition) => [definition.id, definition]));
  for (const [id, choice] of Object.entries(value)) {
    const definition = known.get(id);
    if (definition === undefined) {
      throw configError(
        `unknown convention "${id}". Allowed conventions: ${[...known.keys()].join(', ') || '(none for this preset)'}`,
      );
    }
    validateChoice(id, choice, definition);
  }
}

export function describeConventions(detected, definitions, note = () => undefined) {
  return definitions.map((definition) => describeOne(definition, detected[definition.id], note));
}

function describeNames(definition, { choice, source, files }) {
  const names = `${definition.label}: ${choice.join(', ')}`;
  return source === 'pinned'
    ? `${names} (set in nitpicker.config.json)`
    : `${names} (final call of at least ${String(definition.minFiles)} of ${String(files)} measured files)`;
}

function describeOne(definition, detectedEntry, note) {
  if (definition.kind === 'names') {
    return describeNames(definition, detectedEntry);
  }
  const { choice, source, counts, from, overrides } = detectedEntry;
  const extra = note(definition.id, choice);
  const option = optionLabel(definition, choice);
  const label = `${definition.label}: ${option}${extra === undefined ? '' : `, ${extra}`}`;
  if (source === 'project') {
    const pin = overrides === undefined ? undefined : optionLabel(definition, overrides);
    const overridden =
      overrides === undefined ? '' : `, overriding the pin of ${pin} in nitpicker.config.json`;
    return `${label} (from ${from}${overridden})`;
  }
  if (source === 'pinned') {
    return `${label} (set in nitpicker.config.json)`;
  }
  const measured = Object.values(counts).reduce((total, count) => total + count, 0);
  return source === 'majority'
    ? `${label} (used by ${String(counts[choice])} of ${String(measured)} measured files)`
    : `${label} (preset default; ${measured === 0 ? 'no files to measure' : 'no clear majority'})`;
}
