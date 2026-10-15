import { configError, isPlainObject } from '../config.mjs';

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
    if (!definition.options.includes(choice)) {
      throw configError(
        `"conventions.${id}" must be one of: ${definition.options.map((option) => `"${option}"`).join(', ')}`,
      );
    }
  }
}

export function describeConventions(detected, definitions) {
  return definitions
    .filter((definition) => detected[definition.id] !== undefined)
    .map((definition) => describeOne(definition, detected[definition.id]));
}

function describeOne(definition, { choice, source, counts }) {
  const label = `${definition.label}: ${definition.optionLabels?.[choice] ?? choice}`;
  if (source === 'pinned') {
    return `${label} (set in nitpicker.config.json)`;
  }
  const measured = Object.values(counts).reduce((total, count) => total + count, 0);
  return source === 'majority'
    ? `${label} (used by ${String(counts[choice])} of ${String(measured)} measured files)`
    : `${label} (preset default; ${measured === 0 ? 'no files to measure' : 'no clear majority'})`;
}
