import path from 'node:path';
import {
  configError,
  isPlainObject,
  validateExceptions,
  validateProjectRelativePath,
  validateStringArray,
} from '../../../../shared/config.mjs';
import { SHARED_EXCEPTION_RULES } from '../../../../shared/policy.mjs';
import { ruleIdProblem } from './python-rule-ids.mjs';
import { canonicalRule } from '../../../../shared/exceptions/rule-names.mjs';

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
  const stray = strayException(config.exceptions);
  if (unsupported[0] === 'exceptions' && stray !== undefined) {
    throw configError(
      `"exceptions" has rule "${String(stray.rule)}", which no top-level exception lifts in the python preset. Top-level "exceptions" take only ${SHARED_EXCEPTION_RULES.join(', ')}; a ruff, type-checker or python-rules id goes in "python.exceptions"`,
    );
  }
  if (unsupported.length > 0) {
    throw configError(
      `"${unsupported[0]}" is not supported with "preset": "python": it describes the TypeScript source layout and ESLint rules, which the Python preset does not have. Not supported with python: ${typescriptOnlyKeys.join(', ')}, except exceptions for ${SHARED_EXCEPTION_RULES.join(', ')}. Shared by all presets: thresholds, exclude, legacyInventory`,
    );
  }
  if (config.python !== undefined) {
    validateSettings(config.python);
  }
}

function strayException(exceptions) {
  return Array.isArray(exceptions)
    ? exceptions.find(
        (entry) => !SHARED_EXCEPTION_RULES.includes(canonicalRule(String(entry?.rule))),
      )
    : undefined;
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
    if (SHARED_EXCEPTION_RULES.includes(canonicalRule(rule))) {
      throw configError(
        `"python.exceptions[${String(index)}].rule" is "${rule}", a file limit shared by every preset: lift it in the top-level "exceptions" instead`,
      );
    }
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
