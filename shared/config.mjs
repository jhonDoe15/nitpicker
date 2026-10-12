// The project config (`nitpicker.config.json`) rules that do not depend on a language: the file
// name, the keys every preset honours and their validation. `core/config.mjs` adds the
// TypeScript-only keys (`layout`, `exceptions`) and the preset gate on top of these.
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
];
const WHOLE_NUMBER_THRESHOLD_KEYS = new Set([
  'fileLines',
  'testFileLines',
  'lineLength',
  'folderFiles',
]);

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

export function validateThresholds(thresholds) {
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
