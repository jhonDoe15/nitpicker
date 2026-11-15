import path from 'node:path';
import {
  configError,
  validateProjectRelativePath,
  validateStringArray,
} from '../../../../shared/config.mjs';
import { canonicalRule as untypedCanonicalRule } from '../../../../shared/exceptions/rule-names.mjs';
import { validateExceptions } from '../../../../shared/exceptions/validation.mjs';
import { COMMON_EXCEPTION_RULES } from '../../../../shared/policy.mjs';
import { PYTHON_SIZE_RULES } from '../../../../shared/project-rules/size-rules.mjs';
import { UNUSED_API_RULE_IDS } from '../../../../shared/unused-api/unused-api-policy.mjs';
import { callUntyped } from '../../../../shared/values/boundaries/untyped-call.mts';
import { fieldOf, isPlainObject, listOf } from '../../../../shared/values/readers.mts';
import { ruleIdProblem } from './python-rule-ids.mts';
import { suggestionOrAllowed } from '../../../../shared/messages/closest-match.mjs';

type RuleOptions = { readonly projectRuff: boolean };

const canonicalRule: (rule: string) => string = untypedCanonicalRule;

export const PYTHON_TOP_LEVEL_EXCEPTION_RULES = [
  ...COMMON_EXCEPTION_RULES,
  ...PYTHON_SIZE_RULES,
  UNUSED_API_RULE_IDS.unusedOption,
];

export const ENVIRONMENTS = ['uv', 'poetry', 'path', 'pipenv', 'hatch', 'conda'];
export const FORMATTERS = ['ruff', 'black'];
export const PYTHON_TEST_RUNNERS = ['pytest', 'unittest', 'django', 'nose2'];
export const TYPE_CHECKERS = ['mypy', 'pyright', 'basedpyright'];
export const SETTING_KEYS = [
  'environment',
  'formatter',
  'testRunner',
  'typeChecker',
  'importLinter',
  'sourceRoots',
  'entryPoints',
  'exceptions',
];

export function validatePythonConfig(
  config: Readonly<Record<string, unknown>>,
  typescriptOnlyKeys: readonly string[],
): void {
  if (config['preset'] !== 'python') {
    if (config['python'] !== undefined) {
      throw configError('"python" is only supported with "preset": "python"');
    }
    return;
  }
  const unsupported = typescriptOnlyKeys.filter((key: string) => config[key] !== undefined);
  if (unsupported.length > 0) {
    throw configError(
      `"${unsupported[0] ?? ''}" is not supported with "preset": "python": it describes the TypeScript source layout and ESLint rules, which the Python preset does not have. Not supported with python: ${typescriptOnlyKeys.join(', ')}, except exceptions for ${PYTHON_TOP_LEVEL_EXCEPTION_RULES.join(', ')}. Shared by all presets: thresholds, exclude, legacyInventory`,
    );
  }
  if (config['python'] !== undefined) {
    validateSettings(config['python'], {
      projectRuff: listOf(
        fieldOf(fieldOf(fieldOf(config, 'tools'), 'ruff'), 'precedence'),
      ).includes('project'),
    });
  }
}

function validateKnownKeys(settings: Readonly<Record<string, unknown>>): void {
  for (const key of Object.keys(settings)) {
    if (!SETTING_KEYS.includes(key)) {
      throw configError(
        `unknown key "${key}" in "python"${suggestionOrAllowed(key, SETTING_KEYS)}`,
      );
    }
  }
}

function validateChoices(settings: Readonly<Record<string, unknown>>): void {
  validateChoice(settings['formatter'], 'python.formatter', FORMATTERS);
  validateChoice(settings['testRunner'], 'python.testRunner', PYTHON_TEST_RUNNERS);
  validateChoice(settings['typeChecker'], 'python.typeChecker', TYPE_CHECKERS);
  const environment = settings['environment'];
  if (
    environment !== undefined &&
    !(typeof environment === 'string' && ENVIRONMENTS.includes(environment))
  ) {
    validateEnvironmentDirectory(environment);
  }
}

function validateSettings(settings: unknown, options: RuleOptions): void {
  if (!isPlainObject(settings)) {
    throw configError('"python" must be an object');
  }
  validateKnownKeys(settings);
  validateChoices(settings);
  if (settings['importLinter'] !== undefined && typeof settings['importLinter'] !== 'boolean') {
    throw configError('"python.importLinter" must be true or false');
  }
  if (settings['sourceRoots'] !== undefined) {
    validateSourceRoots(settings['sourceRoots']);
  }
  if (settings['entryPoints'] !== undefined) {
    validateEntryPoints(settings['entryPoints']);
  }
  if (settings['exceptions'] !== undefined) {
    validateRuleIds(settings['exceptions'], options);
    callUntyped(validateExceptions, settings['exceptions'], 'python.exceptions', {
      preset: 'python',
    });
  }
}

function validateRuleIds(exceptions: unknown, options: RuleOptions): void {
  if (!Array.isArray(exceptions)) {
    return;
  }
  for (const [index, entry] of listOf(exceptions).entries()) {
    const rule = fieldOf(entry, 'rule');
    if (typeof rule !== 'string') {
      continue;
    }
    if (PYTHON_TOP_LEVEL_EXCEPTION_RULES.includes(canonicalRule(rule))) {
      throw configError(
        `"python.exceptions[${String(index)}].rule" is "${rule}", a rule that every preset reports with a function or a path: lift it in the top-level "exceptions" instead`,
      );
    }
    const problem = ruleIdProblem(rule, options);
    if (problem !== undefined) {
      throw configError(
        `"python.exceptions[${String(index)}].rule" names no rule nitpicker reports: "${rule}"; ${problem}`,
      );
    }
  }
}

export const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/u;

function validateEnvironmentDirectory(directory: unknown): void {
  if (isAbsolutePath(directory)) {
    return;
  }
  validateProjectRelativePath(directory, 'python.environment');
}

function isAbsolutePath(value: unknown): boolean {
  return typeof value === 'string' && (path.isAbsolute(value) || WINDOWS_ABSOLUTE.test(value));
}

function validateSourceRoots(sourceRoots: unknown): void {
  validateStringArray(sourceRoots, 'python.sourceRoots');
  if (listOf(sourceRoots).length === 0) {
    throw configError('"python.sourceRoots" must not be empty');
  }
  for (const root of listOf(sourceRoots)) {
    validateProjectRelativePath(root, 'python.sourceRoots');
  }
}

function validateEntryPoints(entryPoints: unknown): void {
  validateStringArray(entryPoints, 'python.entryPoints');
  for (const glob of listOf(entryPoints)) {
    validateProjectRelativePath(glob, 'python.entryPoints');
  }
}

function validateChoice(value: unknown, name: string, choices: readonly string[]): void {
  if (value !== undefined && !(typeof value === 'string' && choices.includes(value))) {
    throw configError(`"${name}" must be one of: ${choices.join(', ')}`);
  }
}
