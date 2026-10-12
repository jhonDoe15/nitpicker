import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { validatePythonConfig } from '../languages/python/adapters/python-config.mjs';
import { stylingApproaches } from '../languages/typescript/preset/eslint-config/react-rules.mjs';
import {
  CONFIG_FILE_NAME,
  configError,
  isNonEmptyString,
  isPlainObject,
  liftsOnlyRules,
  validateProjectRelativePath,
  validateStringArray,
  validateThresholds,
} from '../shared/config.mjs';
import { validateJavaConfig } from '../languages/java/adapters/java-policy.mjs';
import { SHARED_EXCEPTION_RULES } from '../shared/policy.mjs';

const SUPPORTED_PRESETS = ['typescript', 'java', 'python'];
const TYPESCRIPT_ONLY_KEYS = ['layout', 'exceptions', 'react', 'tools'];
const KEYS = [
  'base',
  'preset',
  'disable',
  'thresholds',
  'exclude',
  'layout',
  'exceptions',
  'react',
  'analyzers',
  'legacyInventory',
  'python',
  'tools',
];
const LAYOUT_KEYS = ['sourceRoots', 'testRoots', 'excludedGlobs', 'entryPoints'];
const GLOB_LAYOUT_KEYS = ['excludedGlobs', 'entryPoints'];
const EXCEPTION_KEYS = ['rule', 'paths', 'reason'];
const REACT_KEYS = ['enabled', 'styling'];
const CUSTOM_ANALYZER_KEYS = ['name', 'command', 'args'];
const TOOL_SETTING_KEYS = new Map([['prettier', ['precedence']]]);
const PRECEDENCE_LAYERS = ['project', 'nitpicker'];

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
  validateReact(config.react);
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
    validateJavaConfig(config);
  }
  validatePythonConfig(
    config,
    liftsOnlyRules(config.exceptions, SHARED_EXCEPTION_RULES)
      ? TYPESCRIPT_ONLY_KEYS.filter((key) => key !== 'exceptions')
      : TYPESCRIPT_ONLY_KEYS,
  );
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
  if (config.tools !== undefined) {
    validateTools(config.tools);
  }
}

function validateTools(tools) {
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
  validatePrecedence(settings.precedence, name);
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

function validateReact(react) {
  if (react === undefined) {
    return;
  }
  if (!isPlainObject(react)) {
    throw configError('"react" must be an object');
  }
  for (const key of Object.keys(react)) {
    if (!REACT_KEYS.includes(key)) {
      throw configError(`unknown react key "${key}". Allowed react keys: ${REACT_KEYS.join(', ')}`);
    }
  }
  if (react.enabled !== undefined && typeof react.enabled !== 'boolean') {
    throw configError('"react.enabled" must be true or false');
  }
  if (react.styling !== undefined && !stylingApproaches.includes(react.styling)) {
    throw configError(`"react.styling" must be one of: ${stylingApproaches.join(', ')}`);
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
