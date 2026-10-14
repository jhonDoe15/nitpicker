import { GRADLE_PRESETS } from '../../languages/java/adapters/gradle-presets.mjs';
import { configError, isPlainObject } from '../../shared/config.mjs';

const TOOL_SETTING_KEYS = new Map([['prettier', ['precedence']]]);
const GRADLE_TOOL_SETTING_KEYS = new Map([
  ['pmd', ['precedence']],
  ['checkstyle', ['precedence']],
]);
const SINGLE_CONFIG_TOOLS = ['checkstyle'];
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
  validatePrecedence(settings.precedence, name);
  if (SINGLE_CONFIG_TOOLS.includes(name) && settings.precedence.length > 1) {
    throw configError(
      `"tools.${name}.precedence" must be ["nitpicker"] or ["project"]: ${name} runs one configuration, so the two cannot be merged`,
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
      `"tools.${name}.precedence" must list "project", "nitpicker" or both, each once, highest precedence first. For example ["project", "nitpicker"] merges both and lets the project's config win`,
    );
  }
}
