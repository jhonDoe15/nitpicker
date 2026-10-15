import { GRADLE_PRESETS } from '../../languages/java/adapters/gradle-presets.mjs';

import {
  isPlainObject,
  configError,
  isNonEmptyString,
  liftsOnlyRules,
  validateStringArray,
  validateThresholds,
  validateExceptions,
  validateProjectRelativePath,
} from '../../shared/config.mjs';

import { validateJavaConfig } from '../../languages/java/adapters/java-policy.mjs';

import { validateKotlinOptions } from '../../languages/java/adapters/kotlin/kotlin-options.mjs';

import { validatePythonConfig } from '../../languages/python/adapters/configuration/python-config.mjs';

import { SHARED_EXCEPTION_RULES } from '../../shared/policy.mjs';

import { validateTools } from './tool-settings.mjs';

import { stylingApproaches } from '../../languages/typescript/preset/eslint-config/react/react-rules.mjs';

import path from 'node:path';

export const SUPPORTED_PRESETS = ['typescript', 'javascript', ...GRADLE_PRESETS, 'python'];

const TYPESCRIPT_ONLY_KEYS = ['layout', 'exceptions', 'react', 'tools'];

export const KEYS = [
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
  'kotlin',
];

const LAYOUT_KEYS = ['sourceRoots', 'testRoots', 'excludedGlobs', 'entryPoints'];

const GLOB_LAYOUT_KEYS = ['excludedGlobs', 'entryPoints'];

const REACT_KEYS = ['enabled', 'styling'];

const CUSTOM_ANALYZER_KEYS = ['name', 'command', 'args'];

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
  if (GRADLE_PRESETS.includes(config.preset)) {
    validateJavaConfig(config);
  }
  validateKotlinOptions(config);
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
  for (const [key, value] of Object.entries(layout)) validateLayoutEntry(key, value);
}

function validateLayoutEntry(key, value) {
  if (!LAYOUT_KEYS.includes(key)) {
    throw configError(
      `unknown layout key "${key}". Allowed layout keys: ${LAYOUT_KEYS.join(', ')}`,
    );
  }
  validateStringArray(value, `layout.${key}`);
  if (GLOB_LAYOUT_KEYS.includes(key)) {
    return;
  }
  if (value.length === 0) {
    throw configError(`"layout.${key}" must not be empty`);
  }
  for (const root of value) {
    if (!isProjectRelativeDirectory(root)) {
      throw configError(`"layout.${key}" entries must be directories inside the project: ${root}`);
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
  for (const [index, entry] of analyzers.entries())
    validateCustomAnalyzerEntry(entry, `analyzers[${String(index)}]`);
}

function validateCustomAnalyzerEntry(entry, label) {
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
