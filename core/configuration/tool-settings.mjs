import {
  GRADLE_PRESETS,
  PROJECT_TOOL_CONFIGS,
  STYLE_TOOLS,
} from '../../languages/java/adapters/gradle-presets.mjs';
import { configError, isPlainObject } from '../../shared/config.mjs';

const TOOL_SETTING_KEYS = new Map([
  ['prettier', ['precedence']],
  ['eslint', ['engine']],
  ['typescript', ['engine']],
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
const PRECEDENCE_KEYS = ['precedence'];
const SINGLE_CONFIG_TOOLS = ['checkstyle'];
const PROJECT_FIRST_TOOLS = ['ktlint'];
const ORDERED_PRECEDENCE_TOOLS = ['prettier'];
const PRECEDENCE_LAYERS = ['project', 'nitpicker'];

function toolSettingKeysOf(preset) {
  if (GRADLE_PRESETS.includes(preset) || preset === 'python') {
    const names = [
      ...(GRADLE_PRESETS.includes(preset) ? PROJECT_TOOL_CONFIGS.keys() : []),
      ...(STYLE_TOOLS.get(preset) ?? []),
    ];
    return new Map(names.map((tool) => [tool, PRECEDENCE_KEYS]));
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
  validatePrecedence(settings.precedence, name);
  validatePrecedenceOrder(settings.precedence, name);
}

function validatePrecedenceOrder(precedence, name) {
  if (SINGLE_CONFIG_TOOLS.includes(name) && precedence.length > 1) {
    throw configError(
      `"tools.${name}.precedence" must be ["nitpicker"] or ["project"]: ${name} runs one configuration, so the two cannot be merged`,
    );
  }
  if (
    PROJECT_FIRST_TOOLS.includes(name) &&
    precedence[0] === 'nitpicker' &&
    precedence.length > 1
  ) {
    throw configError(
      `"tools.${name}.precedence" must list "project" first: ${name} reads the project's .editorconfig natively, which always wins over nitpicker's measured conventions`,
    );
  }
}

function validateEngine(name, engine) {
  const { values, meaning } = ENGINES.get(name);
  if (engine !== undefined && !values.includes(engine)) {
    throw configError(`"tools.${name}.engine" must be "${values.join('" or "')}". ${meaning}`);
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
