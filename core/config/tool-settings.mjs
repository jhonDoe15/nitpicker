import {
  GRADLE_PRESETS,
  PROJECT_TOOL_CONFIGS,
} from '../../languages/java/adapters/gradle-presets.mjs';
import { configError, isPlainObject } from '../../shared/config.mjs';
import { TEST_RUNNERS } from '../../languages/typescript/preset/test-runner/runners.mjs';

const TOOL_SETTING_KEYS = new Map([
  ['prettier', ['precedence']],
  ['eslint', ['engine']],
  ['typescript', ['engine']],
  ['tests', ['runner']],
]);
const ENGINES = new Map([
  [
    'eslint',
    {
      values: ['oxlint', 'eslint'],
      meaning: '"oxlint" runs the lint rules on oxlint (the default); "eslint" runs them on ESLint',
    },
  ],
  [
    'typescript',
    {
      values: ['native', 'project'],
      meaning:
        '"native" type checks with TypeScript 7 (the default); "project" uses the project\'s own TypeScript',
    },
  ],
]);
const GRADLE_TOOL_SETTING_KEYS = new Map(
  [...PROJECT_TOOL_CONFIGS.keys()].map((tool) => [tool, ['precedence']]),
);
const SINGLE_CONFIG_TOOLS = ['checkstyle'];
const ORDERED_PRECEDENCE_TOOLS = ['prettier'];
const PRECEDENCE_LAYERS = ['project', 'nitpicker'];

export function validateTools(tools, preset) {
  const toolSettingKeys = GRADLE_PRESETS.includes(preset)
    ? GRADLE_TOOL_SETTING_KEYS
    : TOOL_SETTING_KEYS;
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
      `"tools" names unknown tool "${name}". Supported tools with this preset: ${[...toolSettingKeys.keys()].join(', ')}`,
    );
  }
  if (!isPlainObject(settings)) {
    throw configError(`"tools.${name}" must be an object`);
  }
  const unknown = Object.keys(settings).filter((key) => !allowedKeys.includes(key));
  if (unknown.length > 0) {
    throw configError(
      `"tools.${name}" has unknown key "${unknown[0]}". Allowed keys: ${allowedKeys.join(', ')}`,
    );
  }
  if (ENGINES.has(name)) {
    validateEngine(name, settings.engine);
    return;
  }
  if (name === 'tests') {
    validateTestRunner(settings.runner);
    return;
  }
  validatePrecedence(settings.precedence, name);
  if (SINGLE_CONFIG_TOOLS.includes(name) && settings.precedence.length > 1) {
    throw configError(
      `"tools.${name}.precedence" must be ["nitpicker"] or ["project"]: ${name} runs one configuration, so the two cannot be merged`,
    );
  }
}

function validateEngine(name, engine) {
  const { values, meaning } = ENGINES.get(name);
  if (engine !== undefined && !values.includes(engine)) {
    throw configError(`"tools.${name}.engine" must be "${values.join('" or "')}". ${meaning}`);
  }
}

function validateTestRunner(runner) {
  if (runner !== undefined && !TEST_RUNNERS.includes(runner)) {
    throw configError(
      `"tools.tests.runner" must be one of: ${TEST_RUNNERS.join(', ')}. It names the test runner nitpicker runs your tests with; without it the runner is detected from package.json and the test files`,
    );
  }
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
