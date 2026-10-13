import path from 'node:path';
import {
  configError,
  isPlainObject,
  validateExceptions,
  validateProjectRelativePath,
  validateStringArray,
} from '../../../shared/config.mjs';
import { ruleIdProblem } from './python-rule-ids.mjs';

const ENVIRONMENTS = ['uv', 'poetry', 'path'];
const FORMATTERS = ['ruff', 'black'];
const TEST_RUNNERS = ['pytest', 'unittest'];
const TYPE_CHECKERS = ['mypy', 'pyright'];
const SETTING_KEYS = [
  'environment',
  'formatter',
  'testRunner',
  'typeChecker',
  'importLinter',
  'sourceRoots',
  'exceptions',
];

export function validatePythonConfig(config, typescriptOnlyKeys) {
  if (config.preset !== 'python') {
    if (config.python !== undefined) {
      throw configError('"python" is only supported with "preset": "python"');
    }
    return;
  }
  const unsupported = typescriptOnlyKeys.filter((key) => config[key] !== undefined);
  if (unsupported.length > 0) {
    throw configError(
      `"${unsupported[0]}" is not supported with "preset": "python": it describes the TypeScript source layout and ESLint rules, which the Python preset does not have. Not supported with python: ${typescriptOnlyKeys.join(', ')}. Shared by all presets: thresholds, exclude, legacyInventory`,
    );
  }
  if (config.python !== undefined) {
    validateSettings(config.python);
  }
}

function validateKnownKeys(settings) {
  for (const key of Object.keys(settings)) {
    if (!SETTING_KEYS.includes(key)) {
      throw configError(
        `unknown key "${key}" in "python". Allowed keys: ${SETTING_KEYS.join(', ')}`,
      );
    }
  }
}

function validateChoices(settings) {
  validateChoice(settings.formatter, 'python.formatter', FORMATTERS);
  validateChoice(settings.testRunner, 'python.testRunner', TEST_RUNNERS);
  validateChoice(settings.typeChecker, 'python.typeChecker', TYPE_CHECKERS);
  if (settings.environment !== undefined && !ENVIRONMENTS.includes(settings.environment)) {
    validateEnvironmentDirectory(settings.environment);
  }
}

function validateSettings(settings) {
  if (!isPlainObject(settings)) {
    throw configError('"python" must be an object');
  }
  validateKnownKeys(settings);
  validateChoices(settings);
  if (settings.importLinter !== undefined && typeof settings.importLinter !== 'boolean') {
    throw configError('"python.importLinter" must be true or false');
  }
  if (settings.sourceRoots !== undefined) {
    validateSourceRoots(settings.sourceRoots);
  }
  if (settings.exceptions !== undefined) {
    validateExceptions(settings.exceptions, 'python.exceptions');
    validateRuleIds(settings.exceptions);
  }
}

function validateRuleIds(exceptions) {
  for (const [index, { rule }] of exceptions.entries()) {
    const problem = ruleIdProblem(rule);
    if (problem !== undefined) {
      throw configError(
        `"python.exceptions[${String(index)}].rule" names no rule nitpicker reports: "${rule}"; ${problem}`,
      );
    }
  }
}

function validateEnvironmentDirectory(directory) {
  if (isAbsolutePath(directory)) {
    return;
  }
  validateProjectRelativePath(directory, 'python.environment');
}

function isAbsolutePath(value) {
  return typeof value === 'string' && (path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value));
}

function validateSourceRoots(sourceRoots) {
  validateStringArray(sourceRoots, 'python.sourceRoots');
  if (sourceRoots.length === 0) {
    throw configError('"python.sourceRoots" must not be empty');
  }
  for (const root of sourceRoots) {
    validateProjectRelativePath(root, 'python.sourceRoots');
  }
}

function validateChoice(value, name, choices) {
  if (value !== undefined && !choices.includes(value)) {
    throw configError(`"${name}" must be one of: ${choices.join(', ')}`);
  }
}
