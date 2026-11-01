import { FUNCTION_NAME } from '../../../shared/conventions/settings.mjs';
import { CO_CHANGE_DEFAULTS } from '../../../shared/project-rules/hygiene-rules.mjs';
import {
  BINARY_NAME,
  SPRING_KEYS,
  SPRING_ROLES,
} from '../../../languages/java/adapters/spring-arch/spring-roles.mjs';
import {
  HISTORY_KEYS,
  HISTORY_THRESHOLD_KEYS,
  WHOLE_NUMBER_BOUNDS,
} from '../scopes/history-settings.mjs';

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

const springProperties = {
  roles: {
    description:
      'Annotation or type names, by role, whose classes count in that role for the Spring architecture rules, on top of Spring stereotypes. Removing a name loosens the policy.',
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(
      SPRING_ROLES.map((role) => [
        role,
        {
          description: `Binary names of annotations or types whose classes are a ${role}, such as "com.example.UseCase".`,
          type: 'array',
          items: { type: 'string', pattern: BINARY_NAME.source },
        },
      ]),
    ),
  },
};

export const spring = {
  description: 'Spring settings (java and kotlin presets).',
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(SPRING_KEYS.map((key) => [key, springProperties[key]])),
};

const HISTORY_DESCRIPTIONS = {
  commits: 'How many recent commits to read',
  minSupport: 'The commits two modules must share',
  minConfidence: "The share of the less-changed module's commits that must include the other",
  maxCommitFiles: 'The most files a commit may touch and still count',
};

function bounded(key) {
  const { min, max } = WHOLE_NUMBER_BOUNDS[key];
  return {
    type: 'integer',
    minimum: min,
    ...(max === Number.MAX_SAFE_INTEGER ? {} : { maximum: max }),
  };
}

function historySetting(key) {
  const description = `${HISTORY_DESCRIPTIONS[key]} (default ${String(CO_CHANGE_DEFAULTS[key])}). Needs "coChange".`;
  return key === 'minConfidence'
    ? { description, type: 'number', exclusiveMinimum: 0, maximum: 1 }
    : { description, ...bounded(key) };
}

const historyProperties = {
  coChange: {
    description:
      'true turns on the change-history analyzer, which reports modules that keep changing together.',
    type: 'boolean',
  },
  ...Object.fromEntries(HISTORY_THRESHOLD_KEYS.map((key) => [key, historySetting(key)])),
};

export const history = {
  description: 'Opt-in analysis of the commit history (every preset).',
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(HISTORY_KEYS.map((key) => [key, historyProperties[key]])),
  dependencies: Object.fromEntries(HISTORY_THRESHOLD_KEYS.map((key) => [key, ['coChange']])),
};
