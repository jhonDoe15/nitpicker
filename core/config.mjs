import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  CONFIG_FILE_NAME,
  configError,
  isNonEmptyString,
  isPlainObject,
  validateProjectRelativePath,
  validateStringArray,
  validateThresholds,
} from '../shared/config.mjs';

const SUPPORTED_PRESETS = ['typescript', 'java'];
const TYPESCRIPT_ONLY_KEYS = ['layout', 'exceptions'];
const KEYS = [
  'base',
  'preset',
  'disable',
  'thresholds',
  'exclude',
  'layout',
  'exceptions',
  'analyzers',
  'legacyInventory',
];
const LAYOUT_KEYS = ['sourceRoots', 'testRoots', 'excludedGlobs', 'entryPoints'];
const GLOB_LAYOUT_KEYS = ['excludedGlobs', 'entryPoints'];
const EXCEPTION_KEYS = ['rule', 'paths', 'reason'];
const CUSTOM_ANALYZER_KEYS = ['name', 'command', 'args'];

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
  validateKeys(config);
  validateScalars(config);
  validateDisable(config.disable);
  validateOptional(config);
  return config;
}

function validateKeys(config) {
  for (const key of Object.keys(config)) {
    if (!KEYS.includes(key)) {
      throw configError(`unknown key "${key}". Allowed keys: ${KEYS.join(', ')}`);
    }
  }
}

function validateScalars(config) {
  if (config.base !== undefined && !isNonEmptyString(config.base)) {
    throw configError('"base" must be a non-empty string');
  }
  if (config.preset !== undefined && !SUPPORTED_PRESETS.includes(config.preset)) {
    throw configError(`"preset" must be one of: ${SUPPORTED_PRESETS.join(', ')}`);
  }
  if (config.preset === 'java') {
    validateJavaKeys(config);
  }
}

function validateJavaKeys(config) {
  const unsupported = TYPESCRIPT_ONLY_KEYS.filter((key) => config[key] !== undefined);
  if (unsupported.length > 0) {
    throw configError(
      `"${unsupported[0]}" is not supported with "preset": "java": it describes the TypeScript source layout and ESLint rules, which the Java preset does not have. Not supported with java: ${TYPESCRIPT_ONLY_KEYS.join(', ')}. Shared by both presets: thresholds, exclude, legacyInventory`,
    );
  }
}

function validateDisable(disable) {
  if (disable === undefined) {
    return;
  }
  validateStringArray(disable, 'disable');
  if (new Set(disable).size !== disable.length) {
    throw configError('"disable" must not contain duplicates');
  }
}

function validateOptional(config) {
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
  if (config.legacyInventory !== undefined) {
    validateProjectRelativePath(config.legacyInventory, 'legacyInventory');
  }
  if (config.analyzers !== undefined) {
    validateCustomAnalyzers(config.analyzers);
  }
}

export function describeConfigOverrides(config) {
  return KEYS.filter((key) => config[key] !== undefined).flatMap((key) =>
    key === 'exceptions'
      ? config.exceptions.map((entry) => `exception: ${JSON.stringify(entry)}`)
      : [`${key}: ${JSON.stringify(config[key])}`],
  );
}

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

function validateLayout(layout) {
  if (!isPlainObject(layout)) {
    throw configError('"layout" must be an object');
  }
  for (const [key, value] of Object.entries(layout)) {
    if (!LAYOUT_KEYS.includes(key)) {
      throw configError(
        `unknown layout key "${key}". Allowed layout keys: ${LAYOUT_KEYS.join(', ')}`,
      );
    }
    validateStringArray(value, `layout.${key}`);
    if (GLOB_LAYOUT_KEYS.includes(key)) {
      continue;
    }
    if (value.length === 0) {
      throw configError(`"layout.${key}" must not be empty`);
    }
    for (const root of value) {
      if (!isProjectRelativeDirectory(root)) {
        throw configError(
          `"layout.${key}" entries must be directories inside the project: ${root}`,
        );
      }
    }
  }
}

function isProjectRelativeDirectory(root) {
  const normalized = root.replaceAll('\\', '/');
  return (
    !path.isAbsolute(normalized) &&
    !/^[A-Za-z]:/.test(normalized) &&
    !/[*?{}[\]]/.test(normalized) &&
    !normalized.split('/').includes('..') &&
    normalized.replace(/^\.\/?|\/$/g, '').length > 0
  );
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
