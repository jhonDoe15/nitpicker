import path from 'node:path';
import { FACT_RULE_SETTINGS, factRuleSettings } from './project-rules/fact-rules.mts';
import { troubleshootingError } from './messages/troubleshooting.mts';
import { suggestionOrAllowed } from './messages/closest-match.mts';
import { globProblem } from './globs/glob-problems.mts';
import { isPlainObject } from './values/readers.mts';

export { isPlainObject };

export const CONFIG_FILE_NAME = 'nitpicker.config.json';

const DEFAULT_PRESET = 'typescript';

export const SCHEMA_KEY = '$schema';

export const THRESHOLD_KEYS: readonly string[] = [
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
const PRESETS_WITH_INHERITANCE = ['typescript', 'javascript', 'java', 'kotlin', 'python'];
const EVERY_PRESET = [...PRESETS_WITH_INHERITANCE, 'go'];
export const THRESHOLD_PRESETS: Readonly<Record<string, readonly string[]>> = {
  folderDepth: EVERY_PRESET,
  classMethods: EVERY_PRESET,
  classFields: EVERY_PRESET,
  inheritanceDepth: PRESETS_WITH_INHERITANCE,
};
export const WHOLE_NUMBER_THRESHOLD_KEYS: readonly string[] = [
  'fileLines',
  'testFileLines',
  'lineLength',
  'folderFiles',
  'folderDepth',
  'classMethods',
  'classFields',
  'inheritanceDepth',
];

export const FEATURE_LAYOUT_KEYS: readonly string[] = ['sharedRoots', 'featureRoots'];

export const TYPESCRIPT_ONLY_KEYS: readonly string[] = ['exceptions', 'react', 'i18n', 'tools'];

export function configError(message: string, anchor?: string): Error {
  return troubleshootingError(`${CONFIG_FILE_NAME}: ${message}`, anchor);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry: unknown) => typeof entry === 'string');
}

export function listOf(value: unknown): unknown[] {
  if (value === undefined) {
    return [];
  }
  const list: unknown[] = Array.isArray(value) ? value : [value];
  return list;
}

export function picked(
  source: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    keys
      .filter((key) => Object.hasOwn(source, key) && source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
}

export function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateStringArray(value: unknown, name: string): asserts value is string[] {
  if (!(Array.isArray(value) && value.every(isNonEmptyString))) {
    throw configError(`"${name}" must be an array of non-empty strings`);
  }
}

export function validateThresholds(thresholds: unknown, preset = DEFAULT_PRESET): void {
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
    if (WHOLE_NUMBER_THRESHOLD_KEYS.includes(key) && !Number.isInteger(value)) {
      throw configError(`"thresholds.${key}" must be a whole number`);
    }
  }
}

export const DUPLICATES_KEYS = ['skippedFolders'];

export const SKIPPED_FOLDER_NAME = /^[^/\\*?{}[\],]+$/u;

export const DRIVE_LETTER = /^[A-Za-z]:/u;

export const PARENT_SEGMENT = /(?:^|[/\\])\.\.(?:[/\\]|$)/u;

export const GLOB_CHARACTER = /[*?{}[\]]/u;

export function validateDuplicates(duplicates: unknown): void {
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
  if (duplicates['skippedFolders'] !== undefined) {
    validateSkippedFolders(duplicates['skippedFolders']);
  }
}

function validateSkippedFolders(folders: unknown): void {
  validateStringArray(folders, 'duplicates.skippedFolders');
  const invalid = folders.find(
    (name) => !SKIPPED_FOLDER_NAME.test(name) || name.startsWith('!') || ['.', '..'].includes(name),
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

export function validateProjectRelativePath(value: unknown, name: string): void {
  if (!isNonEmptyString(value)) {
    throw configError(`"${name}" must be a non-empty string`);
  }
  const normalized = value.replaceAll('\\', '/');
  if (path.isAbsolute(value) || DRIVE_LETTER.test(value) || PARENT_SEGMENT.test(normalized)) {
    throw configError(`"${name}" must be a path inside the project`);
  }
}

export function validateFileGlobs(globs: readonly string[], label: string): void {
  validateGlobs(globs, label, filesFix);
}

export function validateGlobs(
  globs: readonly string[],
  label: string,
  fix: (glob: string) => string,
): void {
  for (const glob of globs) {
    const problem = globProblem(glob);
    if (problem !== undefined) {
      throw configError(
        `"${label}" glob ${JSON.stringify(glob)} can never match: ${problem.replace('{fix}', () => fix(glob))}`,
      );
    }
  }
}

function folderFix(glob: string): string {
  return JSON.stringify(glob.replace(/\/+$/u, ''));
}

export function filesFix(glob: string): string {
  return JSON.stringify(`${glob}**`);
}

export function validateFolderGlobs(key: string, globs: readonly string[]): void {
  validateGlobs(globs, `layout.${key}`, folderFix);
  for (const glob of globs) {
    const normalized = glob.replaceAll('\\', '/');
    if (
      path.isAbsolute(normalized) ||
      DRIVE_LETTER.test(normalized) ||
      PARENT_SEGMENT.test(normalized)
    ) {
      throw configError(
        `"layout.${key}" entries must be folder globs inside the project, such as "**/shared": ${glob}`,
      );
    }
  }
}

type FactSettingsConfig = {
  readonly preset?: string | undefined;
  readonly history?: { readonly coChange?: unknown } | undefined;
  readonly layout?: unknown;
  readonly testConsole?: unknown;
  readonly protocols?: unknown;
};

function usedFactSettings(config: FactSettingsConfig): string[] {
  const layout = isPlainObject(config.layout) ? config.layout : {};
  return [
    ...(config.testConsole === undefined ? [] : ['testConsole']),
    ...(config.protocols === undefined ? [] : ['protocols']),
    ...FEATURE_LAYOUT_KEYS.filter(
      (key) => Object.hasOwn(layout, key) && layout[key] !== undefined,
    ).map((key) => `layout.${key}`),
  ];
}

function acceptedFactSettings(config: FactSettingsConfig): string[] {
  return [
    ...factRuleSettings(config.preset ?? DEFAULT_PRESET),
    ...(config.history?.coChange === true ? ['layout.featureRoots'] : []),
  ];
}

export function validateFactRuleSettings(config: FactSettingsConfig): void {
  const language = config.preset ?? DEFAULT_PRESET;
  const accepted = acceptedFactSettings(config);
  const unsupported = usedFactSettings(config).find((setting) => !accepted.includes(setting));
  if (unsupported === undefined) {
    return;
  }
  const rules = Object.entries(FACT_RULE_SETTINGS)
    .filter(([, settings]) => settings.includes(unsupported))
    .map(([rule]) => rule);
  throw configError(
    `"${unsupported}" is not supported with "preset": "${language}": it configures ${rules.join(', ')}, which the ${language} preset does not run yet. Remove it`,
  );
}
