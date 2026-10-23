import {
  SCHEMA_KEY,
  THRESHOLD_KEYS,
  THRESHOLD_PRESETS,
  TYPESCRIPT_ONLY_KEYS,
} from '../../../shared/config.mjs';
import { factRuleSettings } from '../../../shared/project-rules/fact-rules.mjs';
import { GRADLE_PRESETS } from '../../../languages/java/adapters/gradle-presets.mjs';
import { NATIVE_LINE_LENGTH } from '../../../languages/java/adapters/java-policy.mjs';
import { conventionDefinitions } from '../../conventions/definitions.mjs';
import { KEYS, NITPICKER_RULES, SUPPORTED_PRESETS } from '../validate.mjs';
import { HEAD_NAMES } from '../project-checks/project-config.mjs';
import { LAYOUT_KEYS, layoutKeysFor } from '../scopes/layout-settings.mjs';
import * as areas from './area-schemas.mjs';
import { conventionProperties } from './convention-schema.mjs';
import {
  exceptionDefinitions,
  exceptionList,
  javaRestriction,
  kotlinRestriction,
  pathProblemRestriction,
  pythonTopLevelRestriction,
  typescriptRestrictions,
} from './exception-schema.mjs';
import {
  enumeration,
  forbid,
  nonEmptyString,
  projectPath,
  sharedDefinitions,
  stringArray,
  without,
} from './schema-parts.mjs';
import { tools, toolsByPreset } from './tools-schema.mjs';

export const SCHEMA_URL =
  'https://raw.githubusercontent.com/jhonDoe15/nitpicker/main/spec/config.schema.json';

const SCOPE_KEYS = TYPESCRIPT_ONLY_KEYS.filter((key) => !['exceptions', 'tools'].includes(key));

const TOP_LEVEL = {
  [SCHEMA_KEY]: {
    description:
      'The JSON Schema of this file, for editor completion and checks. nitpicker ignores it.',
    type: 'string',
  },
  base: {
    description:
      'The base ref used when neither --base nor a CI target branch is given. Never HEAD or the commit you are on.',
    ...nonEmptyString,
    not: { enum: HEAD_NAMES },
  },
  preset: enumeration(
    'The preset; typescript when absent. Java, Kotlin and Python are never detected.',
    SUPPORTED_PRESETS,
  ),
  disable: stringArray(
    'Analyzer names to turn off, without duplicates. Turning one off also turns off the analyzers that depend on it.',
    { uniqueItems: true },
  ),
  thresholds: areas.thresholds,
  exclude: stringArray(
    'Globs, relative to the project root, of files every analyzer skips. Excluding code is a policy loosening.',
  ),
  layout: areas.layout,
  exceptions: exceptionList(
    'Rules lifted for some paths. Each finding prints the entry that lifts it.',
  ),
  react: areas.react,
  i18n: areas.i18n,
  analyzers: areas.analyzers,
  legacyInventory: {
    description:
      'Path of the legacy inventory inside the project; nitpicker.legacy.json when absent.',
    ...projectPath,
  },
  duplicates: areas.duplicates,
  python: areas.python,
  tools,
  testConsole: areas.testConsole,
  kotlin: areas.kotlin,
  spring: areas.spring,
  conventions: {
    description: 'Pins a style that nitpicker otherwise measures from the project.',
    type: 'object',
  },
};

function unavailableKeys(preset) {
  return [
    ...(preset === 'typescript' ? [] : SCOPE_KEYS),
    ...(preset === 'python' ? [] : ['python']),
    ...(preset === 'kotlin' ? [] : ['kotlin']),
    ...(GRADLE_PRESETS.includes(preset) ? [] : ['spring']),
    ...(factRuleSettings(preset).includes('testConsole') ? [] : ['testConsole']),
  ];
}

function unavailableThresholds(preset) {
  return [
    ...THRESHOLD_KEYS.filter(
      (key) => THRESHOLD_PRESETS[key] !== undefined && !THRESHOLD_PRESETS[key].includes(preset),
    ),
    ...(Object.hasOwn(NATIVE_LINE_LENGTH, preset) ? ['lineLength'] : []),
  ];
}

const RULE_RESTRICTIONS = { java: javaRestriction, kotlin: kotlinRestriction };

function exceptionsFor(preset) {
  if (preset === 'python') {
    return { items: { allOf: [pythonTopLevelRestriction, pathProblemRestriction] } };
  }
  return ['typescript', 'javascript'].includes(preset)
    ? {
        items: {
          allOf: typescriptRestrictions,
          properties: { rule: { examples: NITPICKER_RULES } },
        },
      }
    : { items: { allOf: [RULE_RESTRICTIONS[preset], pathProblemRestriction] } };
}

function forbidding(key, forbidden) {
  return forbidden.length === 0 ? {} : { [key]: { properties: forbid(forbidden) } };
}

function presetProperties(preset) {
  return {
    ...forbid(unavailableKeys(preset)),
    ...forbidding('thresholds', unavailableThresholds(preset)),
    ...forbidding('layout', without(layoutKeysFor(preset), LAYOUT_KEYS)),
    ...forbidding('tools', without(toolsByPreset[preset], Object.keys(tools.properties))),
    conventions: conventionProperties(conventionDefinitions(preset)),
    exceptions: exceptionsFor(preset),
  };
}

function presetBlock(preset) {
  return {
    if:
      preset === 'typescript'
        ? { properties: { preset: { const: preset } } }
        : { properties: { preset: { const: preset } }, required: ['preset'] },
    then: { properties: presetProperties(preset) },
  };
}

export function buildConfigSchema() {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: SCHEMA_URL,
    title: 'nitpicker.config.json',
    description:
      'Configuration of nitpicker, a quality gate for code written by coding agents. Generated from the definitions the validator reads (npm run gen:schema).',
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries([SCHEMA_KEY, ...KEYS].map((key) => [key, TOP_LEVEL[key]])),
    allOf: SUPPORTED_PRESETS.map(presetBlock),
    definitions: { ...sharedDefinitions, ...exceptionDefinitions },
  };
}
