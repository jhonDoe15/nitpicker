import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const CONFIG_FILE_NAME = 'nitpicker.config.json';
const SUPPORTED_PRESETS = ['typescript'];
const KEYS = [
  'base',
  'preset',
  'disable',
  'thresholds',
  'exclude',
  'layout',
  'exceptions',
  'analyzers',
];
const THRESHOLD_KEYS = ['crapLimit'];
const LAYOUT_KEYS = ['sourceRoots', 'testRoots', 'excludedGlobs'];
const EXCEPTION_KEYS = ['rule', 'paths', 'reason'];
const CUSTOM_ANALYZER_KEYS = ['name', 'command', 'args'];

/** Reads the optional config file from a project root; zero config yields an empty config. */
export function loadConfig(projectRoot) {
  const configPath = path.join(projectRoot, CONFIG_FILE_NAME);
  if (!existsSync(configPath)) {
    return {};
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `${CONFIG_FILE_NAME} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return validateConfig(parsed);
}

export function validateConfig(config) {
  if (!isPlainObject(config)) {
    throw configError('must be a JSON object');
  }
  for (const key of Object.keys(config)) {
    if (!KEYS.includes(key)) {
      throw configError(`unknown key "${key}". Allowed keys: ${KEYS.join(', ')}`);
    }
  }
  if (config.base !== undefined && !isNonEmptyString(config.base)) {
    throw configError('"base" must be a non-empty string');
  }
  if (config.preset !== undefined && !SUPPORTED_PRESETS.includes(config.preset)) {
    throw configError(`"preset" must be one of: ${SUPPORTED_PRESETS.join(', ')}`);
  }
  if (config.disable !== undefined) {
    validateStringArray(config.disable, 'disable');
    if (new Set(config.disable).size !== config.disable.length) {
      throw configError('"disable" must not contain duplicates');
    }
  }
  if (config.thresholds !== undefined) {
    validateThresholds(config.thresholds);
  }
  if (config.exclude !== undefined) {
    validateStringArray(config.exclude, 'exclude');
  }
  if (config.layout !== undefined) {
    validateLayout(config.layout);
  }
  if (config.exceptions !== undefined) {
    validateExceptions(config.exceptions);
  }
  if (config.analyzers !== undefined) {
    validateCustomAnalyzers(config.analyzers);
  }
  return config;
}

/** One line per override, so the report and the policy hash show every weakened check. */
export function describeConfigOverrides(config) {
  return KEYS.filter((key) => config[key] !== undefined).flatMap((key) =>
    key === 'exceptions'
      ? config.exceptions.map((entry) => `exception: ${JSON.stringify(entry)}`)
      : [`${key}: ${JSON.stringify(config[key])}`],
  );
}

/** Drops disabled analyzers and fails for unknown names or analyzers others still depend on. */
export function applyDisable(analyzers, config) {
  const disabled = config.disable ?? [];
  if (disabled.length === 0) {
    return analyzers;
  }
  const names = new Set(analyzers.map(({ name }) => name));
  const unknown = disabled.filter((name) => !names.has(name));
  if (unknown.length > 0) {
    throw configError(
      `"disable" names unknown analyzers: ${unknown.join(', ')}. Known analyzers: ${[...names].sort().join(', ')}`,
    );
  }
  const remaining = analyzers.filter(({ name }) => !disabled.includes(name));
  for (const analyzer of remaining) {
    const blocked = (analyzer.dependencies ?? []).filter((name) => disabled.includes(name));
    if (blocked.length > 0) {
      throw configError(
        `"disable" cannot disable ${blocked.join(', ')} because ${analyzer.name} depends on it`,
      );
    }
  }
  return remaining;
}

function validateLayout(layout) {
  if (!isPlainObject(layout)) {
    throw configError('"layout" must be an object');
  }
  for (const [key, value] of Object.entries(layout)) {
    if (!LAYOUT_KEYS.includes(key)) {
      throw configError(`unknown layout key "${key}". Allowed keys: ${LAYOUT_KEYS.join(', ')}`);
    }
    validateStringArray(value, `layout.${key}`);
  }
}

/** Each exception names one rule, the files it is lifted for and why. The reason is mandatory. */
function validateExceptions(exceptions) {
  if (!Array.isArray(exceptions)) {
    throw configError('"exceptions" must be an array');
  }
  for (const [index, entry] of exceptions.entries()) {
    const label = `exceptions[${String(index)}]`;
    if (!isPlainObject(entry)) {
      throw configError(`"${label}" must be an object`);
    }
    for (const key of Object.keys(entry)) {
      if (!EXCEPTION_KEYS.includes(key)) {
        throw configError(
          `unknown key "${key}" in "${label}". Allowed keys: ${EXCEPTION_KEYS.join(', ')}`,
        );
      }
    }
    if (!isNonEmptyString(entry.rule)) {
      throw configError(`"${label}.rule" must be a non-empty rule id`);
    }
    validateStringArray(entry.paths, `${label}.paths`);
    if (entry.paths.length === 0) {
      throw configError(`"${label}.paths" needs at least one path glob`);
    }
    if (!isNonEmptyString(entry.reason) || entry.reason.trim().length === 0) {
      throw configError(
        `"${label}.reason" is required: say why the rule is lifted for these paths`,
      );
    }
  }
}

function validateThresholds(thresholds) {
  if (!isPlainObject(thresholds)) {
    throw configError('"thresholds" must be an object');
  }
  for (const [key, value] of Object.entries(thresholds)) {
    if (!THRESHOLD_KEYS.includes(key)) {
      throw configError(
        `unknown threshold "${key}". Allowed thresholds: ${THRESHOLD_KEYS.join(', ')}`,
      );
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw configError(`"thresholds.${key}" must be a positive number`);
    }
  }
}

function validateCustomAnalyzers(analyzers) {
  if (!Array.isArray(analyzers)) {
    throw configError('"analyzers" must be an array');
  }
  for (const [index, entry] of analyzers.entries()) {
    const label = `analyzers[${String(index)}]`;
    if (!isPlainObject(entry)) {
      throw configError(`"${label}" must be an object`);
    }
    for (const key of Object.keys(entry)) {
      if (!CUSTOM_ANALYZER_KEYS.includes(key)) {
        throw configError(`unknown key "${key}" in "${label}"`);
      }
    }
    if (!isNonEmptyString(entry.name) || !isNonEmptyString(entry.command)) {
      throw configError(`"${label}" needs a non-empty "name" and "command"`);
    }
    if (entry.args !== undefined) {
      validateStringArray(entry.args, `${label}.args`);
    }
  }
}

function validateStringArray(value, name) {
  if (!Array.isArray(value) || !value.every(isNonEmptyString)) {
    throw configError(`"${name}" must be an array of non-empty strings`);
  }
}

function configError(message) {
  return new Error(`${CONFIG_FILE_NAME}: ${message}`);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
