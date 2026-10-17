// The project config (`nitpicker.config.json`) rules that do not depend on a language: the file
// name, the keys every preset honours and their validation. `core/configuration/config.mjs` adds the
// TypeScript-only keys (`layout`, `tools`) and the preset gate on top of these.
//
// Language-neutral: no imports from `core/`, `languages/` or tool packages.

import path from 'node:path';

export const CONFIG_FILE_NAME = 'nitpicker.config.json';

/** Thresholds a project can set; the file limits take whole numbers. */
export const THRESHOLD_KEYS = [
  'crapLimit',
  'fileLines',
  'testFileLines',
  'lineLength',
  'folderFiles',
  'unitTestSeconds',
  'integrationTestSeconds',
];
const TEST_TIME_KEYS = ['unitTestSeconds', 'integrationTestSeconds'];
const TEST_TIME_PRESETS = new Set(['java', 'kotlin']);
const WHOLE_NUMBER_THRESHOLD_KEYS = new Set([
  'fileLines',
  'testFileLines',
  'lineLength',
  'folderFiles',
]);

const EXCEPTION_KEYS = ['rule', 'paths', 'reason'];

const TEST_CONSOLE_KEYS = ['allow'];

const ALLOW_KEYS = ['contains', 'paths', 'reason'];

const MIN_ALLOW_CHARACTERS = 3;

export const TYPESCRIPT_ONLY_KEYS = ['layout', 'exceptions', 'react', 'i18n', 'tools'];

export function configError(message) {
  return new Error(`${CONFIG_FILE_NAME}: ${message}`);
}

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateStringArray(value, name) {
  if (!Array.isArray(value) || !value.every(isNonEmptyString)) {
    throw configError(`"${name}" must be an array of non-empty strings`);
  }
}

export function validateThresholds(thresholds, preset) {
  if (!isPlainObject(thresholds)) {
    throw configError('"thresholds" must be an object');
  }
  const testTime = TEST_TIME_KEYS.find((key) => thresholds[key] !== undefined);
  if (testTime !== undefined && !TEST_TIME_PRESETS.has(preset)) {
    throw configError(
      `"thresholds.${testTime}" is supported only with "preset": "java" or "kotlin"`,
    );
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
    if (WHOLE_NUMBER_THRESHOLD_KEYS.has(key) && !Number.isInteger(value)) {
      throw configError(`"thresholds.${key}" must be a whole number`);
    }
  }
}

/** Whether every `exceptions` entry lifts one of `rules` (the file limits a non-ESLint preset honours). */
export function liftsOnlyRules(exceptions, rules) {
  return Array.isArray(exceptions) && exceptions.every((entry) => rules.includes(entry?.rule));
}

export function validateProjectRelativePath(value, name) {
  if (!isNonEmptyString(value)) {
    throw configError(`"${name}" must be a non-empty string`);
  }
  const normalized = value.replaceAll('\\', '/');
  if (path.isAbsolute(value) || /^[A-Za-z]:/.test(value) || normalized.split('/').includes('..')) {
    throw configError(`"${name}" must be a path inside the project`);
  }
}

export function validateExceptions(exceptions, name = 'exceptions') {
  if (!Array.isArray(exceptions)) {
    throw configError(`"${name}" must be an array`);
  }
  for (const [index, entry] of exceptions.entries()) {
    validateException(entry, `${name}[${String(index)}]`);
  }
}

function validateException(entry, label) {
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
    throw configError(`"${label}.reason" is required: say why the rule is lifted for these paths`);
  }
}

export function validateTestConsole(testConsole) {
  if (testConsole === undefined) {
    return;
  }
  if (!isPlainObject(testConsole)) {
    throw configError('"testConsole" must be an object');
  }
  const unknown = Object.keys(testConsole).find((key) => !TEST_CONSOLE_KEYS.includes(key));
  if (unknown !== undefined) {
    throw configError(
      `unknown testConsole key "${unknown}". Allowed testConsole keys: ${TEST_CONSOLE_KEYS.join(', ')}`,
    );
  }
  if (testConsole.allow === undefined) {
    return;
  }
  if (!Array.isArray(testConsole.allow)) {
    throw configError('"testConsole.allow" must be an array');
  }
  for (const [index, entry] of testConsole.allow.entries()) {
    validateAllowEntry(entry, `testConsole.allow[${String(index)}]`);
  }
}

function hasSpecificText(text) {
  return text.replaceAll(/[\s\d]/gu, '').length >= MIN_ALLOW_CHARACTERS;
}

function validateAllowEntry(entry, label) {
  if (!isPlainObject(entry)) {
    throw configError(`"${label}" must be an object`);
  }
  for (const key of Object.keys(entry)) {
    if (!ALLOW_KEYS.includes(key)) {
      const hint = key === 'pattern' ? ': use "contains"' : '';
      throw configError(
        `unknown key "${key}" in "${label}"${hint}. Allowed keys: ${ALLOW_KEYS.join(', ')}`,
      );
    }
  }
  if (typeof entry.contains !== 'string' || !hasSpecificText(entry.contains)) {
    throw configError(`"${label}.contains" must keep at least 3 characters besides digits`);
  }
  if (entry.paths !== undefined) {
    validateStringArray(entry.paths, `${label}.paths`);
    if (entry.paths.length === 0) {
      throw configError(`"${label}.paths" needs at least one path glob`);
    }
  }
  if (!isNonEmptyString(entry.reason) || entry.reason.trim().length === 0) {
    throw configError(`"${label}.reason" is required: say which library prints this and why`);
  }
}
