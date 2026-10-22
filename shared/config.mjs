// The project config (`nitpicker.config.json`) rules that do not depend on a language: the file
// name, the keys every preset honours and their validation. `core/configuration/config.mjs` adds the
// TypeScript-only keys (`layout`, `tools`) and the preset gate on top of these.
//
// Language-neutral: no imports from `core/`, `languages/` or tool packages.

import path from 'node:path';
import { canonicalRule, toolPrefixError } from './exceptions/rule-names.mjs';
import { PLACEHOLDER_REASONS } from './exceptions/sentence.mjs';
import {
  FUNCTION_EXCEPTION_RULES,
  FUNCTION_REQUIRED_RULES,
  NAME_EXCEPTION_RULES,
} from './policy.mjs';
import { PACKAGE_EXCEPTION_RULES } from './project-rules/hygiene-rules.mjs';

export const CONFIG_FILE_NAME = 'nitpicker.config.json';

/** Thresholds a project can set; the file limits take whole numbers. */
export const THRESHOLD_KEYS = [
  'crapLimit',
  'fileLines',
  'testFileLines',
  'lineLength',
  'folderFiles',
  'folderDepth',
  'classMethods',
  'classFields',
  'inheritanceDepth',
  'unitTestSeconds',
  'integrationTestSeconds',
];
const THRESHOLD_PRESETS = {
  folderDepth: ['typescript', 'javascript', 'java', 'kotlin', 'python'],
  classMethods: ['java', 'kotlin', 'python'],
  classFields: ['java', 'kotlin', 'python'],
  inheritanceDepth: ['java', 'kotlin', 'python'],
};
const WHOLE_NUMBER_THRESHOLD_KEYS = new Set([
  'fileLines',
  'testFileLines',
  'lineLength',
  'folderFiles',
  'folderDepth',
  'classMethods',
  'classFields',
  'inheritanceDepth',
]);

const EXCEPTION_KEYS = ['rule', 'paths', 'packages', 'function', 'name', 'reason'];

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

const PRINTED_RULES = new Map([['test-runtime/slow-test', 'slow-test']]);

export function withCanonicalRules(config) {
  if (!isPlainObject(config) || !Array.isArray(config.exceptions)) {
    return config;
  }
  return {
    ...config,
    exceptions: config.exceptions.map((entry) =>
      isPlainObject(entry) && PRINTED_RULES.has(entry.rule)
        ? { ...entry, rule: PRINTED_RULES.get(entry.rule) }
        : entry,
    ),
  };
}

export function validateThresholds(thresholds, preset = 'typescript') {
  if (!isPlainObject(thresholds)) {
    throw configError('"thresholds" must be an object');
  }
  for (const [key, value] of Object.entries(thresholds)) {
    if (!THRESHOLD_KEYS.includes(key)) {
      throw configError(
        `unknown threshold "${key}". Allowed thresholds: ${THRESHOLD_KEYS.join(', ')}`,
      );
    }
    if (THRESHOLD_PRESETS[key] !== undefined && !THRESHOLD_PRESETS[key].includes(preset)) {
      throw configError(
        `"thresholds.${key}" is only supported with "preset": ${THRESHOLD_PRESETS[key].map((name) => `"${name}"`).join(', ')}`,
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

const DUPLICATES_KEYS = ['skippedFolders'];

export function validateDuplicates(duplicates) {
  if (!isPlainObject(duplicates)) {
    throw configError('"duplicates" must be an object');
  }
  for (const key of Object.keys(duplicates)) {
    if (!DUPLICATES_KEYS.includes(key)) {
      throw configError(
        `unknown duplicates key "${key}". Allowed duplicates keys: ${DUPLICATES_KEYS.join(', ')}`,
      );
    }
  }
  if (duplicates.skippedFolders !== undefined) {
    validateSkippedFolders(duplicates.skippedFolders);
  }
}

function validateSkippedFolders(folders) {
  validateStringArray(folders, 'duplicates.skippedFolders');
  const invalid = folders.find(
    (name) => !/^[^/\\*?{}[\],]+$/.test(name) || name.startsWith('!') || ['.', '..'].includes(name),
  );
  if (invalid !== undefined) {
    throw configError(
      `"duplicates.skippedFolders" entries must be folder names without slashes, commas, glob characters or a leading "!": ${invalid}`,
    );
  }
  if (new Set(folders).size !== folders.length) {
    throw configError('"duplicates.skippedFolders" must not contain duplicates');
  }
}

/** Whether every `exceptions` entry lifts one of `rules` (the file limits a non-ESLint preset honours). */
export function liftsOnlyRules(exceptions, rules) {
  return (
    Array.isArray(exceptions) &&
    exceptions.every(
      (entry) => typeof entry?.rule === 'string' && rules.includes(canonicalRule(entry.rule)),
    )
  );
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

export function validateExceptions(exceptions, name = 'exceptions', { preset } = {}) {
  if (!Array.isArray(exceptions)) {
    throw configError(`"${name}" must be an array`);
  }
  for (const [index, entry] of exceptions.entries()) {
    validateException(entry, `${name}[${String(index)}]`, preset);
  }
}

function validateException(entry, label, preset) {
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
  if (/^(?:[\w-]+\/)?TS\d+$/u.test(entry.rule)) {
    throw configError(
      `"${label}.rule" is "${entry.rule}", a TypeScript compiler diagnostic: it has no exception, fix the type error`,
    );
  }
  const prefixError = toolPrefixError(entry.rule, preset);
  if (prefixError !== undefined) {
    throw configError(`"${label}.rule" has an ${prefixError}`);
  }
  validatePaths(entry.paths, `${label}.paths`);
  validateNarrowing(entry, label);
  const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
  if (reason === '') {
    throw configError(`"${label}.reason" is required: say why the rule is lifted for these paths`);
  }
  if (PLACEHOLDER_REASONS.includes(reason)) {
    throw configError(
      `"${label}.reason" is the placeholder a message prints: say why this is intended`,
    );
  }
  if (entry.packages !== undefined) {
    validatePackages(entry, label);
  }
}

function validatePaths(paths, label) {
  validateStringArray(paths, label);
  if (paths.length === 0) {
    throw configError(`"${label}" needs at least one path glob`);
  }
  for (const glob of paths) {
    const normalized = glob.replaceAll('\\', '/');
    if (
      glob.trim() === '' ||
      path.isAbsolute(glob) ||
      /^[A-Za-z]:/u.test(glob) ||
      normalized.split('/').includes('..')
    ) {
      throw configError(
        `"${label}" has "${glob}": use a glob relative to the project root, without \`..\``,
      );
    }
  }
}

function validateNarrowing(entry, label) {
  const rule = canonicalRule(entry.rule);
  validateNarrowingKey(entry, label, {
    key: 'function',
    supported: FUNCTION_EXCEPTION_RULES,
    required: FUNCTION_REQUIRED_RULES,
    requiredText: `name the function whose uncovered branches are accepted. To accept a whole file, add it to "exclude"`,
  });
  validateNarrowingKey(entry, label, {
    key: 'name',
    supported: NAME_EXCEPTION_RULES,
    required: [],
  });
  if (entry.function !== undefined && entry.name !== undefined) {
    throw configError(`"${label}" takes either "function" or "name", not both (rule ${rule})`);
  }
}

function validateNarrowingKey(entry, label, { key, supported, required, requiredText }) {
  const rule = canonicalRule(entry.rule);
  if (entry[key] === undefined) {
    if (required.includes(rule)) {
      throw configError(`"${label}.${key}" is required for ${entry.rule}: ${requiredText}`);
    }
    return;
  }
  if (!supported.includes(rule)) {
    throw configError(
      `"${label}.${key}" is only supported for these rules: ${supported.join(', ')}`,
    );
  }
  if (typeof entry[key] !== 'string' || entry[key].trim() === '') {
    throw configError(`"${label}.${key}" must be a non-blank name`);
  }
}

function validatePackages(entry, label) {
  if (!PACKAGE_EXCEPTION_RULES.includes(entry.rule)) {
    throw configError(
      `"${label}.packages" is only for the rules ${PACKAGE_EXCEPTION_RULES.join(', ')}`,
    );
  }
  validateStringArray(entry.packages, `${label}.packages`);
  if (entry.packages.length === 0) {
    throw configError(`"${label}.packages" needs at least one package name`);
  }
}
