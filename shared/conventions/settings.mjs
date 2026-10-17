import { configError, isPlainObject } from '../config.mjs';

const NAME = /^[A-Za-z_]\w*$/;

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
    validateChoice(definition, choice);
  }
}

function validateChoice(definition, choice) {
  if (definition.kind === 'names') {
    const valid =
      Array.isArray(choice) && choice.every((name) => typeof name === 'string' && NAME.test(name));
    if (!valid) {
      throw configError(`"conventions.${definition.id}" must be a list of function names`);
    }
  } else if (!definition.options.includes(choice)) {
    throw configError(
      `"conventions.${definition.id}" must be one of: ${definition.options.map((option) => `"${option}"`).join(', ')}`,
    );
  }
}

export function describeConventions(detected, definitions, note = () => undefined) {
  return definitions.map((definition) => describeOne(definition, detected[definition.id], note));
}

function describeOne(definition, { choice, source, counts, files, from, overrides }, note) {
  if (Array.isArray(choice)) {
    const names = `${definition.label}: ${choice.join(', ')}`;
    return source === 'pinned'
      ? `${names} (set in nitpicker.config.json)`
      : `${names} (final call of at least ${String(definition.minFiles)} of ${String(files)} measured files)`;
  }
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
