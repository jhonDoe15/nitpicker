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
    if (definition.kind === 'names') {
      if (
        !Array.isArray(choice) ||
        !choice.every((name) => typeof name === 'string' && NAME.test(name))
      ) {
        throw configError(`"conventions.${id}" must be a list of function names`);
      }
      continue;
    }
    if (!definition.options.includes(choice)) {
      throw configError(
        `"conventions.${id}" must be one of: ${definition.options.map((option) => `"${option}"`).join(', ')}`,
      );
    }
  }
}

export function describeConventions(detected, definitions) {
  return definitions.map((definition) => describeOne(definition, detected[definition.id]));
}

function describeOne(definition, { choice, source, counts, files }) {
  if (Array.isArray(choice)) {
    const names = `${definition.label}: ${choice.join(', ')}`;
    return source === 'pinned'
      ? `${names} (set in nitpicker.config.json)`
      : `${names} (final call of at least ${String(definition.minFiles)} of ${String(files)} measured files)`;
  }
  const label = `${definition.label}: ${definition.optionLabels[choice]}`;
  if (source === 'pinned') {
    return `${label} (set in nitpicker.config.json)`;
  }
  const measured = Object.values(counts).reduce((total, count) => total + count, 0);
  return source === 'majority'
    ? `${label} (used by ${String(counts[choice])} of ${String(measured)} measured files)`
    : `${label} (preset default; ${measured === 0 ? 'no files to measure' : 'no clear majority'})`;
}
