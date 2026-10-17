import { GRADLE_PRESETS } from '../../languages/java/adapters/gradle-presets.mjs';
import {
  isPlainObject,
  configError,
  isNonEmptyString,
  liftsOnlyRules,
  validateStringArray,
  validateThresholds,
  validateExceptions,
  TYPESCRIPT_ONLY_KEYS,
  validateProjectRelativePath,
} from '../../shared/config.mjs';
import { validateJavaConfig } from '../../languages/java/adapters/java-policy.mjs';
import { validateKotlinOptions } from '../../languages/java/adapters/kotlin/kotlin-options.mjs';
import {
  PYTHON_TOP_LEVEL_EXCEPTION_RULES,
  validatePythonConfig,
} from '../../languages/python/adapters/configuration/python-config.mjs';
import { validateTools } from './tool-settings.mjs';
import { rejectHeadBase } from './project-checks/project-config.mjs';
import { conventionDefinitions } from '../conventions/definitions.mjs';
import { validateConventions } from '../../shared/conventions/settings.mjs';
import { stylingApproaches } from '../../languages/typescript/preset/eslint-config/react/react-rules.mjs';
import { i18nRuleIds } from '../../languages/typescript/preset/eslint-config/i18n/i18n-rules.mjs';
import { validateScope, validateTestConsole } from './scopes/scope-settings.mjs';
import path from 'node:path';

export const SUPPORTED_PRESETS = ['typescript', 'javascript', ...GRADLE_PRESETS, 'python'];

export const KEYS = [
  'base',
  'preset',
  'disable',
  'thresholds',
  'exclude',
  'layout',
  'exceptions',
  'react',
  'i18n',
  'analyzers',
  'legacyInventory',
  'python',
  'tools',
  'testConsole',
  'kotlin',
  'conventions',
];

const LAYOUT_KEYS = ['sourceRoots', 'testRoots', 'excludedGlobs', 'entryPoints'];

const GLOB_LAYOUT_KEYS = ['excludedGlobs', 'entryPoints'];

const REACT_KEYS = ['enabled', 'styling'];

const I18N_KEYS = ['enabled', 'functionNames', 'componentNames'];

const CUSTOM_ANALYZER_KEYS = ['name', 'command', 'args'];

export function validateConfig(config) {
  if (!isPlainObject(config)) {
    throw configError('must be a JSON object');
  }
  validateKeys(config);
  validateScalars(config);
  validateDisable(config.disable);
  validateReact(config.react);
  validateI18n(config.i18n);
  validateTestConsole(config.testConsole);
  validateOptional(config);
  validateProjectConventions(config);
  return config;
}

function validateKeys(config) {
  for (const key of Object.keys(config)) {
    if (!KEYS.includes(key)) {
      throw configError(`unknown key "${key}". Allowed keys: ${KEYS.join(', ')}`);
    }
  }
}

function validateScalars(config) {
  if (config.base !== undefined && !isNonEmptyString(config.base)) {
    throw configError('"base" must be a non-empty string');
  }
  rejectHeadBase(config.base);
  if (config.preset !== undefined && !SUPPORTED_PRESETS.includes(config.preset)) {
    throw configError(`"preset" must be one of: ${SUPPORTED_PRESETS.join(', ')}`);
  }
  if (GRADLE_PRESETS.includes(config.preset)) {
    validateJavaConfig(config);
  }
  validateJavascriptConfig(config);
  validateKotlinOptions(config);
  validatePythonConfig(
    config,
    liftsOnlyRules(config.exceptions, PYTHON_TOP_LEVEL_EXCEPTION_RULES)
      ? TYPESCRIPT_ONLY_KEYS.filter((key) => !['exceptions', 'tools'].includes(key))
      : TYPESCRIPT_ONLY_KEYS.filter((key) => key !== 'tools'),
  );
}

const JAVASCRIPT_UNSUPPORTED_KEYS = [
  [
    'react',
    'React and JSX belong to the TypeScript preset, so remove the key, or use "preset": "typescript" for a React project',
  ],
  [
    'i18n',
    'the message rules check react-intl messages and the text in JSX, which belong to the TypeScript preset, so remove the key, or use "preset": "typescript" for a project with translated messages',
  ],
];

function validateJavascriptConfig(config) {
  if (config.preset !== 'javascript') {
    return;
  }
  for (const [key, reason] of JAVASCRIPT_UNSUPPORTED_KEYS) {
    if (config[key] !== undefined) {
      throw configError(`"${key}" is not supported with "preset": "javascript": ${reason}`);
    }
  }
}

function validateProjectConventions({ conventions, preset }) {
  if (conventions !== undefined) {
    validateConventions(conventions, conventionDefinitions(preset));
  }
}

function validateDisable(disable) {
  if (disable === undefined) {
    return;
  }
  validateStringArray(disable, 'disable');
  if (new Set(disable).size !== disable.length) {
    throw configError('"disable" must not contain duplicates');
  }
}

function validateOptional(config) {
  if (config.thresholds !== undefined) {
    validateThresholds(config.thresholds, config.preset);
  }
  if (config.exclude !== undefined) {
    validateStringArray(config.exclude, 'exclude');
  }
  if (config.layout !== undefined) {
    validateLayout(config.layout);
  }
  if (config.exceptions !== undefined) {
    validateExceptions(config.exceptions);
    validateI18nExceptions(config.exceptions, config.preset);
  }
  if (config.legacyInventory !== undefined) {
    validateProjectRelativePath(config.legacyInventory, 'legacyInventory');
  }
  if (config.analyzers !== undefined) {
    validateCustomAnalyzers(config.analyzers);
  }
  if (config.tools !== undefined) {
    validateTools(config.tools, config.preset);
  }
}

function validateReact(react) {
  validateScope('react', react, REACT_KEYS);
  if (react?.styling !== undefined && !stylingApproaches.includes(react.styling)) {
    throw configError(`"react.styling" must be one of: ${stylingApproaches.join(', ')}`);
  }
}

function validateI18n(i18n) {
  validateScope('i18n', i18n, I18N_KEYS);
  for (const key of ['functionNames', 'componentNames']) {
    if (i18n?.[key] !== undefined) {
      validateStringArray(i18n[key], `i18n.${key}`);
    }
  }
}

function validateI18nExceptions(exceptions, preset) {
  if (!['typescript', 'javascript', undefined].includes(preset)) {
    return;
  }
  for (const [index, { rule }] of exceptions.entries()) {
    if (rule.startsWith('formatjs/') && !i18nRuleIds.includes(rule)) {
      throw configError(
        `"exceptions[${String(index)}].rule" names ${rule}, which nitpicker does not run. The i18n rules it runs: ${i18nRuleIds.join(', ')}`,
      );
    }
  }
}

function validateLayout(layout) {
  if (!isPlainObject(layout)) {
    throw configError('"layout" must be an object');
  }
  for (const [key, value] of Object.entries(layout)) validateLayoutEntry(key, value);
}

function validateLayoutEntry(key, value) {
  if (!LAYOUT_KEYS.includes(key)) {
    throw configError(
      `unknown layout key "${key}". Allowed layout keys: ${LAYOUT_KEYS.join(', ')}`,
    );
  }
  validateStringArray(value, `layout.${key}`);
  if (GLOB_LAYOUT_KEYS.includes(key)) {
    return;
  }
  if (value.length === 0) {
    throw configError(`"layout.${key}" must not be empty`);
  }
  for (const root of value) {
    if (!isProjectRelativeDirectory(root)) {
      throw configError(`"layout.${key}" entries must be directories inside the project: ${root}`);
    }
  }
}

function isProjectRelativeDirectory(root) {
  const normalized = root.replaceAll('\\', '/');
  return (
    !path.isAbsolute(normalized) &&
    !/^[A-Za-z]:/.test(normalized) &&
    !/[*?{}[\]]/.test(normalized) &&
    !normalized.split('/').includes('..') &&
    normalized.replace(/^\.\/?|\/$/g, '').length > 0
  );
}

function validateCustomAnalyzers(analyzers) {
  if (!Array.isArray(analyzers)) {
    throw configError('"analyzers" must be an array');
  }
  for (const [index, entry] of analyzers.entries())
    validateCustomAnalyzerEntry(entry, `analyzers[${String(index)}]`);
}

function validateCustomAnalyzerEntry(entry, label) {
  if (!isPlainObject(entry)) {
    throw configError(`"${label}" must be an object`);
  }
  for (const key of Object.keys(entry)) {
    if (!CUSTOM_ANALYZER_KEYS.includes(key)) {
      throw configError(`unknown key "${key}" in "${label}"`);
    }
  }
  if (!isNonEmptyString(entry.name) || !isNonEmptyString(entry.command)) {
    throw configError(`"${label}" needs a non-empty "name" and "command"`);
  }
  if (entry.args !== undefined) {
    validateStringArray(entry.args, `${label}.args`);
  }
}
