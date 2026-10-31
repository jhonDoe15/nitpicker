import path from 'node:path';
import { FACT_RULE_SETTINGS, factRuleSettings } from './project-rules/fact-rules.mjs';
import { suggestionOrAllowed } from './messages/closest-match.mjs';

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
  folderDepth: ['typescript', 'javascript', 'java', 'kotlin', 'python', 'go'],
  classMethods: ['java', 'kotlin', 'python', 'go'],
  classFields: ['java', 'kotlin', 'python', 'go'],
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

export const FEATURE_LAYOUT_KEYS = ['sharedRoots', 'featureRoots'];

export const TYPESCRIPT_ONLY_KEYS = ['exceptions', 'react', 'i18n', 'tools'];

export function configError(message) {
  return new Error(`${CONFIG_FILE_NAME}: ${message}`);
}

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

export function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

export function isStringList(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function listOf(value) {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function picked(source, keys) {
  return Object.fromEntries(
    keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  );
}

export function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateStringArray(value, name) {
  if (!Array.isArray(value) || !value.every(isNonEmptyString)) {
    throw configError(`"${name}" must be an array of non-empty strings`);
  }
}

export function validateThresholds(thresholds, preset = 'typescript') {
  if (!isPlainObject(thresholds)) {
    throw configError('"thresholds" must be an object');
  }
  for (const [key, value] of Object.entries(thresholds)) {
    if (!THRESHOLD_KEYS.includes(key)) {
      throw configError(
        `unknown threshold "${key}"${suggestionOrAllowed(key, THRESHOLD_KEYS, 'Allowed thresholds')}`,
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
        `unknown duplicates key "${key}"${suggestionOrAllowed(key, DUPLICATES_KEYS, 'Allowed duplicates keys')}`,
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

export function validateProjectRelativePath(value, name) {
  if (!isNonEmptyString(value)) {
    throw configError(`"${name}" must be a non-empty string`);
  }
  const normalized = value.replaceAll('\\', '/');
  if (path.isAbsolute(value) || /^[A-Za-z]:/.test(value) || normalized.split('/').includes('..')) {
    throw configError(`"${name}" must be a path inside the project`);
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

export function validateGlobs(globs, label, fix) {
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

export function filesFix(glob) {
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
  const accepted = [
    ...factRuleSettings(language),
    ...(config.history?.coChange === true ? ['layout.featureRoots'] : []),
  ];
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

export function shownSetting(value) {
  return value === undefined ? 'not set' : JSON.stringify(value);
}
