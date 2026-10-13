import path from 'node:path';
import {
  configError,
  isPlainObject,
  validateProjectRelativePath,
  validateStringArray,
} from '../../../shared/config.mjs';

const ENVIRONMENTS = ['uv', 'poetry', 'path'];
const FORMATTERS = ['ruff', 'black'];
const TEST_RUNNERS = ['pytest', 'unittest'];
const SETTING_KEYS = ['environment', 'formatter', 'testRunner', 'importLinter', 'sourceRoots'];

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

function validateSettings(settings) {
  if (!isPlainObject(settings)) {
    throw configError('"python" must be an object');
  }
  for (const key of Object.keys(settings)) {
    if (!SETTING_KEYS.includes(key)) {
      throw configError(
        `unknown key "${key}" in "python". Allowed keys: ${SETTING_KEYS.join(', ')}`,
      );
    }
  }
  validateChoice(settings.formatter, 'python.formatter', FORMATTERS);
  validateChoice(settings.testRunner, 'python.testRunner', TEST_RUNNERS);
  if (settings.environment !== undefined && !ENVIRONMENTS.includes(settings.environment)) {
    validateEnvironmentDirectory(settings.environment);
  }
  if (settings.importLinter !== undefined && typeof settings.importLinter !== 'boolean') {
    throw configError('"python.importLinter" must be true or false');
  }
  if (settings.sourceRoots !== undefined) {
    validateSourceRoots(settings.sourceRoots);
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
