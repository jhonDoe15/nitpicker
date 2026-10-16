import { configError, isPlainObject } from '../config.mjs';

const NAMES = /^(?:[A-Za-z_$][\w$]*(?:,[A-Za-z_$][\w$]*)*)?$/;

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
    if (definition.kind === 'names') {
      if (typeof choice !== 'string' || !NAMES.test(choice)) {
        throw configError(
          `"conventions.${id}" must be a comma separated list of method names, or an empty string`,
        );
      }
    } else if (!definition.options.includes(choice)) {
      throw configError(
        `"conventions.${id}" must be one of: ${definition.options.map((option) => `"${option}"`).join(', ')}`,
      );
    }
  }
}

export function describeConventions(detected, definitions, note = () => undefined) {
  return definitions.map((definition) => describeOne(definition, detected[definition.id], note));
}

function describeNames(definition, { choice, source, files }) {
  const list = choice.split(',').join(', ');
  return source === 'pinned'
    ? `${definition.label}: ${list} (set in nitpicker.config.json)`
    : `${definition.label}: ${list} (the last call of at least ${String(definition.minFiles)} of ${String(files)} measured files)`;
}

function describeOne(definition, detectedEntry, note) {
  if (definition.kind === 'names') {
    return describeNames(definition, detectedEntry);
  }
  const { choice, source, counts, from, overrides } = detectedEntry;
  const extra = note(definition.id, choice);
  const option = definition.optionLabels[choice] ?? choice;
  const label = `${definition.label}: ${option}${extra === undefined ? '' : `, ${extra}`}`;
  if (source === 'project') {
    const pin = definition.optionLabels[overrides] ?? overrides;
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
