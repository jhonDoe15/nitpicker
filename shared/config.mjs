import path from 'node:path';
import { canonicalRule, toolPrefixError } from './exceptions/rule-names.mjs';
import { PLACEHOLDER_REASONS } from './exceptions/sentence.mjs';
import {
  FUNCTION_EXCEPTION_RULES,
  FUNCTION_REQUIRED_RULES,
  NAME_EXCEPTION_RULES,
} from './policy.mjs';
import { FACT_RULE_SETTINGS, factRuleSettings } from './project-rules/fact-rules.mjs';
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

export const FEATURE_LAYOUT_KEYS = ['sharedRoots', 'featureRoots'];

export const TYPESCRIPT_ONLY_KEYS = ['exceptions', 'react', 'i18n', 'tools'];

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

export function validateExceptions(
  exceptions,
  name = 'exceptions',
  { preset, functionOptional = false, matchesOwnGlobs = () => true } = {},
) {
  if (!Array.isArray(exceptions)) {
    throw configError(`"${name}" must be an array`);
  }
  for (const [index, entry] of exceptions.entries()) {
    validateException(entry, `${name}[${String(index)}]`, {
      preset,
      functionOptional,
      matchesOwnGlobs,
    });
  }
}

function validateException(entry, label, { preset, functionOptional, matchesOwnGlobs }) {
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
  validateExceptionPaths(entry, label, matchesOwnGlobs);
  validateNarrowing(entry, label, functionOptional);
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

function validateExceptionPaths(entry, label, matchesOwnGlobs) {
  const paths = entry.paths;
  const pathsLabel = `${label}.paths`;
  validateStringArray(paths, pathsLabel);
  if (paths.length === 0) {
    throw configError(`"${pathsLabel}" needs at least one path glob`);
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
        `"${pathsLabel}" has "${glob}": use a glob relative to the project root, without \`..\``,
      );
    }
  }
  if (matchesOwnGlobs(entry.rule)) {
    validateGlobs(paths, pathsLabel, filesFix);
  }
}

function validateNarrowing(entry, label, functionOptional) {
  const rule = canonicalRule(entry.rule);
  validateNarrowingKey(entry, label, {
    key: 'function',
    supported: FUNCTION_EXCEPTION_RULES,
    required: functionOptional ? [] : FUNCTION_REQUIRED_RULES,
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

export function validateFileGlobs(globs, label) {
  validateGlobs(globs, label, filesFix);
}

function hasUnclosedBrace(glob) {
  let depth = 0;
  let escaped = false;
  for (const character of glob) {
    if (escaped) {
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}' && depth > 0) {
      depth -= 1;
    }
  }
  return depth > 0;
}

const GLOB_PROBLEMS = [
  [(glob) => glob.startsWith('./'), 'drop the leading "./": globs match from the project root'],
  [(glob) => glob.endsWith('/'), 'drop the trailing "/": write {fix}'],
  [
    (glob) => glob.includes('(?'),
    'regular expression flags such as (?i) are not supported: globs match case-sensitively, so list each spelling in braces, such as {README,readme}.md',
  ],
  [hasUnclosedBrace, 'a "{" is never closed'],
];

function validateGlobs(globs, label, fix) {
  for (const glob of globs) {
    const [, problem] = GLOB_PROBLEMS.find(([matches]) => matches(glob)) ?? [];
    if (problem !== undefined) {
      throw configError(
        `"${label}" glob ${JSON.stringify(glob)} can never match: ${problem.replace('{fix}', fix(glob))}`,
      );
    }
  }
}

function folderFix(glob) {
  return JSON.stringify(glob.replace(/\/+$/u, ''));
}

function filesFix(glob) {
  return JSON.stringify(`${glob}**`);
}

export function validateFolderGlobs(key, globs) {
  validateGlobs(globs, `layout.${key}`, folderFix);
  for (const glob of globs) {
    const normalized = glob.replaceAll('\\', '/');
    if (
      path.isAbsolute(normalized) ||
      /^[A-Za-z]:/.test(normalized) ||
      normalized.split('/').includes('..')
    ) {
      throw configError(
        `"layout.${key}" entries must be folder globs inside the project, such as "**/shared": ${glob}`,
      );
    }
  }
}

function usedFactSettings(config) {
  const layout = isPlainObject(config.layout) ? config.layout : {};
  return [
    ...(config.testConsole === undefined ? [] : ['testConsole']),
    ...FEATURE_LAYOUT_KEYS.filter((key) => layout[key] !== undefined).map((key) => `layout.${key}`),
  ];
}

export function validateFactRuleSettings(config) {
  const language = config.preset ?? 'typescript';
  const accepted = factRuleSettings(language);
  const unsupported = usedFactSettings(config).find((setting) => !accepted.includes(setting));
  if (unsupported === undefined) {
    return;
  }
  const [rule] = Object.entries(FACT_RULE_SETTINGS).find(([, settings]) =>
    settings.includes(unsupported),
  );
  throw configError(
    `"${unsupported}" is not supported with "preset": "${language}": it configures ${rule}, which the ${language} preset does not run yet. Remove it`,
  );
}
