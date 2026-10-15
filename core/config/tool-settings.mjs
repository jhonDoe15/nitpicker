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
const PRECEDENCE_LAYERS = ['project', 'nitpicker'];

export function validateTools(tools) {
  if (!isPlainObject(tools)) {
    throw configError('"tools" must be an object keyed by tool name');
  }
  for (const [name, settings] of Object.entries(tools)) {
    validateToolSettings(name, settings);
  }
}

function validateToolSettings(name, settings) {
  const allowedKeys = TOOL_SETTING_KEYS.get(name);
  if (allowedKeys === undefined) {
    throw configError(
      `"tools" names unknown tool "${name}". Supported tools: ${[...TOOL_SETTING_KEYS.keys()].join(', ')}`,
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
      `"tools.${name}.precedence" must list "project", "nitpicker" or both, each once, highest precedence first. For example ["project", "nitpicker"] merges both and lets the project's config win`,
    );
  }
}
