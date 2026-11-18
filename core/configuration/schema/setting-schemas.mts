import { FUNCTION_NAME } from '../../../shared/conventions/settings.mjs';
import { CO_CHANGE_DEFAULTS } from '../views/schema-views.mts';
import {
  BINARY_NAME,
  SPRING_KEYS,
  SPRING_ROLES,
} from '../../../languages/java/adapters/spring-arch/spring-roles.mts';
import {
  HISTORY_KEYS,
  HISTORY_THRESHOLD_KEYS,
  WHOLE_NUMBER_BOUNDS,
  isWholeNumberKey,
} from '../scopes/history-settings.mts';
import type {
  ChoiceConvention,
  ConventionDefinition,
} from '../../../shared/values/config-types.mts';
import type { JsonSchema } from './schema-parts.mts';
import type { SchemaTable, TextTable } from '../views/schema-views.mts';

function optionText(definition: ChoiceConvention, option: string): string {
  const unit = definition.unit === undefined ? '' : ` ${definition.unit}`;
  return `"${option}" (${definition.optionLabels?.[option] ?? `${option}${unit}`})`;
}

function choiceSchema(definition: ConventionDefinition): JsonSchema {
  if (definition.options === undefined) {
    return {
      description: `${definition.label}: ${definition.namesMeaning ?? 'the names of the helper functions that count as assertions'}.`,
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

export function conventionProperties(definitions: readonly ConventionDefinition[]): JsonSchema {
  return {
    properties: Object.fromEntries(
      definitions.map((definition) => [definition.id, choiceSchema(definition)]),
    ),
    additionalProperties: false,
  };
}

const springProperties: SchemaTable = {
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

const HISTORY_DESCRIPTIONS: TextTable = {
  commits: 'How many recent commits to read',
  minSupport: 'The commits two modules must share',
  minConfidence: "The share of the less-changed module's commits that must include the other",
  maxCommitFiles: 'The most files a commit may touch and still count',
};

function bounded(key: keyof typeof WHOLE_NUMBER_BOUNDS): JsonSchema {
  const { min, max } = WHOLE_NUMBER_BOUNDS[key];
  return {
    type: 'integer',
    minimum: min,
    ...(max === Number.MAX_SAFE_INTEGER ? {} : { maximum: max }),
  };
}

function historySetting(key: string): JsonSchema {
  const description = `${String(HISTORY_DESCRIPTIONS[key])} (default ${String(CO_CHANGE_DEFAULTS[key])}). Needs "coChange".`;
  if (key === 'minConfidence') {
    return { description, type: 'number', exclusiveMinimum: 0, maximum: 1 };
  }
  return isWholeNumberKey(key) ? { description, ...bounded(key) } : { description };
}

const historyProperties: SchemaTable = {
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

function memberNames(description: string): JsonSchema {
  return {
    description,
    type: 'array',
    minItems: 1,
    items: { type: 'string', minLength: 1 },
  };
}

export const protocols = {
  description:
    'Lifecycle contracts for the protocol-contract rule: a type whose open member must be followed by a close member on every exit.',
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['type', 'open', 'close'],
    properties: {
      type: {
        description: 'The class or interface name, such as "Session".',
        type: 'string',
        minLength: 1,
      },
      open: memberNames('Members that start the lifecycle.'),
      close: memberNames('Members that end the lifecycle; one must run on every exit.'),
      steps: memberNames('Members that must come after an open member.'),
      reason: { description: 'Why the contract exists.', type: 'string', pattern: String.raw`\S` },
    },
  },
};
