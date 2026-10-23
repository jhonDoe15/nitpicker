import { FUNCTION_NAME } from '../../../shared/conventions/settings.mjs';

function optionText(definition, option) {
  const unit = definition.unit === undefined ? '' : ` ${definition.unit}`;
  return `"${option}" (${definition.optionLabels?.[option] ?? `${option}${unit}`})`;
}

function choiceSchema(definition) {
  if (definition.kind === 'names') {
    return {
      description: `${definition.label}: the names of the helper functions that count as assertions.`,
      type: 'array',
      items: { type: 'string', pattern: FUNCTION_NAME.source },
    };
  }
  const options = definition.options.map((option) => optionText(definition, option));
  const range = definition.range === undefined ? '' : `, or ${definition.range}`;
  const description = `${definition.label}: ${options.join(', ')}${range}.`;
  return definition.valuePattern === undefined
    ? { description, enum: definition.options }
    : {
        description,
        anyOf: [
          { enum: definition.options },
          { type: 'string', pattern: definition.valuePattern.source },
        ],
      };
}

export function conventionProperties(definitions) {
  return {
    properties: Object.fromEntries(
      definitions.map((definition) => [definition.id, choiceSchema(definition)]),
    ),
    additionalProperties: false,
  };
}
