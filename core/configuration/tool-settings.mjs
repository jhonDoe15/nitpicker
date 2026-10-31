import path from 'node:path';
import {
  BUILD_DECLARED_TOOLS,
  GRADLE_PRESETS,
  PROJECT_TOOL_CONFIGS,
  styleToolsOf,
} from '../../languages/java/adapters/gradle-presets.mjs';
import { configError, isPlainObject } from '../../shared/config.mjs';
import { TEST_RUNNERS } from '../../languages/typescript/preset/test-runner/runners.mjs';
import { validateTestTimeouts } from '../../shared/test-timeouts/resolve.mjs';
import { suggestionOrAllowed } from '../../shared/messages/closest-match.mjs';

const TOOL_SETTING_KEYS = new Map([
  ['prettier', ['precedence']],
  ['jscpd', ['precedence']],
  ['knip', ['precedence']],
  ['dependency-cruiser', ['precedence']],
  ['eslint', ['engine', 'precedence']],
  ['typescript', ['engine', 'project']],
  ['tests', ['runner', 'timeouts']],
]);
const ENGINES = new Map([
  [
    'eslint',
    {
      key: 'engine',
      values: ['oxlint', 'eslint'],
      meaning: '"oxlint" runs the lint rules on oxlint (the default); "eslint" runs them on ESLint',
    },
  ],
  [
    'typescript',
    {
      key: 'engine',
      values: ['native', 'project'],
      meaning:
        '"native" type checks with TypeScript 7 (the default); "project" uses the project\'s own TypeScript',
    },
  ],
  [
    'tests',
    {
      key: 'runner',
      values: TEST_RUNNERS,
      meaning:
        "It names the runner that runs the project's tests; without it nitpicker uses the runner the project's test script, config files or dependencies name",
    },
  ],
]);
const PRECEDENCE_KEYS = ['precedence'];
const NITPICKER_FIRST_REJECTED = new Map([
  [
    'ktlint',
    "ktlint reads the project's .editorconfig natively, which always wins over nitpicker's measured conventions",
  ],
  [
    'ktfmt',
    "ktfmt reads the project's .editorconfig natively, which always wins over nitpicker's measured conventions",
  ],
  [
    'black',
    "black has no flag that switches string normalization back on, so nitpicker's quote style cannot win over the project's skip-string-normalization",
  ],
]);
const ORDERED_PRECEDENCE_TOOLS = ['prettier', 'jscpd', 'knip', 'dependency-cruiser', 'eslint'];
const PRECEDENCE_LAYERS = ['project', 'nitpicker'];

function toolSettingKeysOf(preset) {
  if (GRADLE_PRESETS.includes(preset) || preset === 'python' || preset === 'go') {
    const names = [
      ...(GRADLE_PRESETS.includes(preset)
        ? [...PROJECT_TOOL_CONFIGS.keys(), ...BUILD_DECLARED_TOOLS]
        : []),
      ...styleToolsOf(preset),
    ];
    const duplicateScan = preset === 'go' ? [] : ['jscpd'];
    return new Map([...names, ...duplicateScan].map((tool) => [tool, PRECEDENCE_KEYS]));
  }
  return TOOL_SETTING_KEYS;
}

export function validateTools(tools, preset) {
  const toolSettingKeys = toolSettingKeysOf(preset);
  if (!isPlainObject(tools)) {
    throw configError('"tools" must be an object keyed by tool name');
  }
  for (const [name, settings] of Object.entries(tools)) {
    validateToolSettings(name, settings, toolSettingKeys);
  }
}

function validateToolSettings(name, settings, toolSettingKeys) {
  const allowedKeys = toolSettingKeys.get(name);
  if (allowedKeys === undefined) {
    throw configError(
      `"tools" names unknown tool "${name}"${suggestionOrAllowed(name, [...toolSettingKeys.keys()], 'Supported tools with this preset')}`,
    );
  }
  if (!isPlainObject(settings)) {
    throw configError(`"tools.${name}" must be an object`);
  }
  const unknown = Object.keys(settings).filter((key) => !allowedKeys.includes(key));
  if (unknown.length > 0) {
    throw configError(
      `"tools.${name}" has unknown key "${unknown[0]}"${suggestionOrAllowed(unknown[0], allowedKeys)}`,
    );
  }
  if (ENGINES.has(name)) {
    validateEngineSettings(name, settings);
    if (settings.precedence === undefined) {
      return;
    }
  }
  validatePrecedence(settings.precedence, name);
  validatePrecedenceOrder(settings.precedence, name);
}

function validateEngineSettings(name, settings) {
  validateEngine(name, settings[ENGINES.get(name).key]);
  if (name === 'tests' && settings.timeouts !== undefined) {
    validateTestTimeouts(settings.timeouts);
  }
  if (name === 'typescript') {
    validateTypeScriptProject(settings.project);
  }
}

function validatePrecedenceOrder(precedence, name) {
  if (
    NITPICKER_FIRST_REJECTED.has(name) &&
    precedence[0] === 'nitpicker' &&
    precedence.length > 1
  ) {
    throw configError(
      `"tools.${name}.precedence" must list "project" first: ${NITPICKER_FIRST_REJECTED.get(name)}`,
    );
  }
}

function validateEngine(name, engine) {
  const { key, values, meaning } = ENGINES.get(name);
  if (engine !== undefined && !values.includes(engine)) {
    throw configError(`"tools.${name}.${key}" must be ${choiceList(values)}. ${meaning}`);
  }
}

function choiceList(values) {
  const quoted = values.map((value) => `"${value}"`);
  return `${quoted.slice(0, -1).join(', ')} or ${quoted.at(-1)}`;
}

function validatePrecedence(precedence, name) {
  const isValid =
    Array.isArray(precedence) &&
    precedence.length > 0 &&
    precedence.every((layer) => PRECEDENCE_LAYERS.includes(layer)) &&
    new Set(precedence).size === precedence.length;
  if (!isValid) {
    throw configError(
      `"tools.${name}.precedence" must list "project", "nitpicker" or both, each once${ORDERED_PRECEDENCE_TOOLS.includes(name) ? ', highest first' : ''}`,
    );
  }
}

function validateTypeScriptProject(project) {
  if (project === undefined) {
    return;
  }
  const normalized = typeof project === 'string' ? project.replaceAll('\\', '/') : '';
  if (
    normalized.trim().length === 0 ||
    normalized.includes('\0') ||
    path.posix.isAbsolute(normalized) ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split('/').includes('..') ||
    /[*?{}[\]]/.test(normalized) ||
    !normalized.endsWith('.json')
  ) {
    throw configError('"tools.typescript.project" must name a JSON config file inside the project');
  }
}
