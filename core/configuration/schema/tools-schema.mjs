import {
  TEST_TIMEOUT_LANGUAGES,
  TIMEOUT_LIMIT_KEYS,
  TIMEOUT_PROJECT_KEYS,
  TIMEOUT_SECTION_KEYS,
} from '../../../shared/test-timeouts/resolve.mjs';
import { SUPPORTED_PRESETS } from '../validate.mjs';
import {
  ORDERED_PRECEDENCE_TOOLS,
  PRECEDENCE_LAYERS,
  engineOf,
  nitpickerFirstReason,
  toolSettingKeysOf,
} from '../tool-settings.mjs';
import { enumeration, positiveInteger, projectPath } from './schema-parts.mjs';

const LIMIT_DESCRIPTIONS = {
  testTimeoutMs: 'The timeout of one test, in milliseconds.',
  hookTimeoutMs: 'The timeout of one setup or teardown hook, in milliseconds.',
  testDeclarationCeilingMs: 'The longest timeout a test may declare for itself, in milliseconds.',
  hookDeclarationCeilingMs: 'The longest timeout a hook may declare for itself, in milliseconds.',
};

const TYPESCRIPT_PROJECT = String.raw`^(?![/\\])(?![A-Za-z]:)(?!(?:.*[/\\])?\.\.(?:[/\\]|$))[^*?{}\[\]\u0000]*\.json$`;

function limitProperties() {
  return Object.fromEntries(
    TIMEOUT_LIMIT_KEYS.map((key) => [
      key,
      { description: LIMIT_DESCRIPTIONS[key], ...positiveInteger },
    ]),
  );
}

function limits(description, extraProperties = {}, required = []) {
  return {
    description,
    type: 'object',
    additionalProperties: false,
    properties: { ...extraProperties, ...limitProperties() },
    ...(required.length === 0 ? {} : { required }),
  };
}

const timeoutProject = limits(
  'One group of test files with its own limits.',
  {
    language: enumeration('The language the group is timed as.', TEST_TIMEOUT_LANGUAGES),
    include: {
      description: 'Globs of the test files in the group, relative to the project root.',
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: { ...projectPath, not: { pattern: '^!' } },
    },
  },
  TIMEOUT_PROJECT_KEYS,
);

const timeoutSections = {
  defaults: limits('Limits for every test.'),
  languages: {
    description: 'Limits per language.',
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(
      TEST_TIMEOUT_LANGUAGES.map((language) => [language, limits(`Limits for ${language} tests.`)]),
    ),
  },
  projects: {
    description: 'Named groups of test files with their own limits.',
    type: 'object',
    propertyNames: { pattern: String.raw`\S` },
    additionalProperties: timeoutProject,
  },
};

const timeouts = {
  description: 'Timeout tiers for the tests of the project.',
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(TIMEOUT_SECTION_KEYS.map((key) => [key, timeoutSections[key]])),
};

function precedenceDescription(tool) {
  const order = ORDERED_PRECEDENCE_TOOLS.includes(tool) ? ', highest first' : '';
  const first = nitpickerFirstReason(tool);
  return `Which config ${tool} uses: "project" is your own config file, "nitpicker" is the preset's. List each at most once${order}.${first === undefined ? '' : ` "project" must come first: ${first}.`}`;
}

function precedence(tool) {
  return {
    description: precedenceDescription(tool),
    type: 'array',
    minItems: 1,
    uniqueItems: true,
    items: { enum: PRECEDENCE_LAYERS },
    ...(nitpickerFirstReason(tool) !== undefined
      ? { not: { minItems: 2, items: [{ const: 'nitpicker' }] } }
      : {}),
  };
}

function settingSchema(tool, key) {
  if (key === 'precedence') {
    return precedence(tool);
  }
  if (key === 'project') {
    return {
      description: 'The TypeScript config file of the project the type check reads.',
      type: 'string',
      pattern: TYPESCRIPT_PROJECT,
    };
  }
  if (key === 'timeouts') {
    return timeouts;
  }
  const { values, meaning } = engineOf(tool);
  return enumeration(meaning, values);
}

function allToolSettings() {
  const merged = new Map();
  for (const preset of SUPPORTED_PRESETS) {
    for (const [tool, keys] of toolSettingKeysOf(preset)) {
      merged.set(tool, [...new Set([...(merged.get(tool) ?? []), ...keys])]);
    }
  }
  return merged;
}

export const toolsByPreset = Object.fromEntries(
  SUPPORTED_PRESETS.map((preset) => [preset, [...toolSettingKeysOf(preset).keys()]]),
);

export const tools = {
  description: 'Which config each tool uses, and its engine or runner.',
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(
    [...allToolSettings()].map(([tool, keys]) => [
      tool,
      {
        description: `Settings of ${tool}.`,
        type: 'object',
        additionalProperties: false,
        ...(engineOf(tool) === undefined ? { required: ['precedence'] } : {}),
        properties: Object.fromEntries(keys.map((key) => [key, settingSchema(tool, key)])),
      },
    ]),
  ),
};
