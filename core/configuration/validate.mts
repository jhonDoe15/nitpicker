import { GRADLE_PRESETS } from '../../languages/java/adapters/gradle-presets.mjs';
import {
  configError,
  SCHEMA_KEY,
  validateStringArray,
  validateThresholds,
  validateDuplicates,
  TYPESCRIPT_ONLY_KEYS,
  validateProjectRelativePath,
  validateFactRuleSettings,
} from '../../shared/config.mjs';
import { validateJavaConfig } from '../../languages/java/adapters/java-policy.mjs';
import { validateKotlinOptions } from '../../languages/java/adapters/kotlin/kotlin-options.mjs';
import { validateJavaBuildSetting } from '../../languages/java/builds/build-tool/build-tool-setting.mjs';
import { validateSpringOptions } from '../../languages/java/adapters/spring-arch/spring-roles.mjs';
import {
  PYTHON_TOP_LEVEL_EXCEPTION_RULES,
  validatePythonConfig,
} from '../../languages/python/adapters/configuration/python-config.mjs';
import { validateGoConfig } from '../../languages/go/adapters/configuration/go-config.mjs';
import { validateAnalyzerTimeouts } from '../../shared/analyzer-timeouts/analyzer-timeouts.mjs';
import { validateTools } from './tool-settings.mts';
import { fieldOf, textOf, textsOf } from '../../shared/values/readers.mts';
import type { NitpickerConfig } from '../../shared/values/config-types.mts';
import { rejectHeadBase } from './project-checks/project-config.mjs';
import { conventionDefinitions } from '../conventions/definitions.mts';
import { validateConventions } from '../../shared/conventions/settings.mjs';
import { validateScope, validateTestConsole } from './scopes/scope-settings.mts';
import { validateHistory } from './scopes/history-settings.mts';
import { validateProtocols } from './scopes/protocols/protocol-settings.mts';
import { TYPESCRIPT_PRESETS, validateLayout } from './scopes/layout-settings.mts';
import { isPlainObject } from './views/config-views.mts';
import {
  canonicalRule,
  didYouMean,
  i18nRuleIds,
  isNonEmptyString,
  liftsOnlyRules,
  RULES,
  stylingApproaches,
  suggestionOrAllowed,
  validateExceptions,
} from './views/validation-views.mts';
import { validateExtends, validateProjects } from './layers/settings.mjs';

type OptionalValidator = (value: unknown, key: string, preset: string | undefined) => void;

const OPTIONAL_VALIDATORS: readonly (readonly [string, OptionalValidator])[] = [
  [
    'thresholds',
    (thresholds: unknown, _key: string, preset: string | undefined) => {
      validateThresholds(thresholds, preset);
    },
  ],
  ['exclude', validateStringArray],
  ['exceptions', validateProjectExceptions],
  ['legacyInventory', validateProjectRelativePath],
  ['duplicates', validateDuplicates],
  ['analyzers', validateCustomAnalyzers],
  ['analyzerTimeoutMinutes', validateAnalyzerTimeouts],
  ['extends', validateExtends],
  ['projects', (projects: unknown) => validateProjects(projects, SUPPORTED_PRESETS)],
];
export const SUPPORTED_PRESETS = ['typescript', 'javascript', ...GRADLE_PRESETS, 'python', 'go'];

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
  'analyzerTimeoutMinutes',
  'legacyInventory',
  'duplicates',
  'python',
  'tools',
  'testConsole',
  'protocols',
  'kotlin',
  'java',
  'spring',
  'conventions',
  'go',
  'history',
  'extends',
  'projects',
];

export const REACT_KEYS = ['enabled', 'styling'];

export const I18N_KEYS = ['enabled', 'functionNames', 'componentNames'];

export const CUSTOM_ANALYZER_KEYS = ['name', 'command', 'args'];

const NITPICKER_RULE_IDS = new Set(RULES.map(({ id }) => id));

export const NITPICKER_RULES = [...NITPICKER_RULE_IDS];

const TYPESCRIPT_RULE_NAMES = new Map([['doc-comment-content', 'nitpicker/no-comments']]);

export const RENAMED_TYPESCRIPT_RULES = [...TYPESCRIPT_RULE_NAMES.keys()];

export function validateConfig(input: unknown): NitpickerConfig {
  if (!isPlainObject(input)) {
    throw configError('must be a JSON object');
  }
  const config: NitpickerConfig = input;
  validateKeys(config);
  validateFactRuleSettings(config);
  validateScalars(config);
  validateDisable(config.disable);
  validateReact(config.react);
  validateI18n(config.i18n);
  validateTestConsole(config.testConsole);
  validateProtocols(config.protocols);
  validateHistory(config.history);
  validateOptional(config);
  validateProjectConventions(config);
  return config;
}

export function validateKeys(config: NitpickerConfig): void {
  for (const key of Object.keys(config)) {
    if (!KEYS.includes(key) && key !== SCHEMA_KEY) {
      throw configError(`unknown key "${key}"${suggestionOrAllowed(key, [SCHEMA_KEY, ...KEYS])}`);
    }
  }
  if (config[SCHEMA_KEY] !== undefined && typeof config[SCHEMA_KEY] !== 'string') {
    throw configError(`"${SCHEMA_KEY}" must be a string`);
  }
}

function validateScalars(config: NitpickerConfig): void {
  if (config.base !== undefined && !isNonEmptyString(config.base)) {
    throw configError('"base" must be a non-empty string');
  }
  rejectHeadBase(config.base);
  if (config.preset !== undefined && !SUPPORTED_PRESETS.includes(config.preset)) {
    throw configError(`"preset" must be one of: ${SUPPORTED_PRESETS.join(', ')}`);
  }
  if (config.preset !== undefined && GRADLE_PRESETS.includes(config.preset)) {
    validateJavaConfig(config);
  }
  validateJavascriptConfig(config);
  validateKotlinOptions(config);
  validateGoConfig(config);
  validateJavaBuildSetting(config);
  validateSpringOptions(config);
  validatePythonConfig(
    config,
    liftsOnlyRules(config.exceptions, PYTHON_TOP_LEVEL_EXCEPTION_RULES)
      ? TYPESCRIPT_ONLY_KEYS.filter((key) => !['exceptions', 'tools'].includes(key))
      : TYPESCRIPT_ONLY_KEYS.filter((key) => key !== 'tools'),
  );
}

const JAVASCRIPT_UNSUPPORTED_KEYS: readonly (readonly [string, string])[] = [
  [
    'react',
    'React and JSX belong to the TypeScript preset, so remove the key, or use "preset": "typescript" for a React project',
  ],
  [
    'i18n',
    'the message rules check react-intl messages and the text in JSX, which belong to the TypeScript preset, so remove the key, or use "preset": "typescript" for a project with translated messages',
  ],
];

function validateJavascriptConfig(config: NitpickerConfig): void {
  if (config.preset !== 'javascript') {
    return;
  }
  for (const [key, reason] of JAVASCRIPT_UNSUPPORTED_KEYS) {
    if (config[key] !== undefined) {
      throw configError(`"${key}" is not supported with "preset": "javascript": ${reason}`);
    }
  }
}

function validateProjectConventions({ conventions, preset }: NitpickerConfig): void {
  if (conventions !== undefined) {
    validateConventions(conventions, conventionDefinitions(preset));
  }
}

function validateDisable(disable: unknown): void {
  if (disable === undefined) {
    return;
  }
  validateStringArray(disable, 'disable');
  const names = textsOf(disable);
  if (new Set(names).size !== names.length) {
    throw configError('"disable" must not contain duplicates');
  }
}

function validateOptional(config: NitpickerConfig): void {
  for (const [key, validate] of OPTIONAL_VALIDATORS) {
    if (config[key] !== undefined) {
      validate(config[key], key, config.preset);
    }
  }
  if (config.layout !== undefined) {
    validateLayout(config.layout, config.preset, config.history);
  }
  if (config.tools !== undefined) {
    validateTools(config.tools, config.preset);
  }
}

function validateReact(react: unknown): void {
  validateScope('react', react, REACT_KEYS);
  const styling = fieldOf(react, 'styling');
  if (styling !== undefined && !stylingApproaches.includes(textOf(styling))) {
    throw configError(`"react.styling" must be one of: ${stylingApproaches.join(', ')}`);
  }
}

function validateI18n(i18n: unknown): void {
  validateScope('i18n', i18n, I18N_KEYS);
  for (const key of ['functionNames', 'componentNames']) {
    if (fieldOf(i18n, key) !== undefined) {
      validateStringArray(fieldOf(i18n, key), `i18n.${key}`);
    }
  }
}

function exceptionRuleProblem(rule: string, preset: string | undefined): string | undefined {
  if (rule.startsWith('formatjs/') && !i18nRuleIds.includes(rule)) {
    return `which nitpicker does not run. The i18n rules it runs: ${i18nRuleIds.join(', ')}`;
  }
  const native = TYPESCRIPT_RULE_NAMES.get(canonicalRule(rule));
  return native === undefined
    ? undefined
    : `which the ${preset ?? 'typescript'} preset reports as ${native}: name "${native}" instead`;
}

function validateProjectExceptions(
  exceptions: unknown,
  key: string,
  preset: string | undefined,
): void {
  validateTypescriptExceptionRules(exceptions, preset);
  validateExceptions(exceptions, key, {
    preset: preset ?? 'typescript',
    matchesOwnGlobs: TYPESCRIPT_PRESETS.includes(preset)
      ? (rule: string) => NITPICKER_RULE_IDS.has(canonicalRule(rule))
      : undefined,
  });
}

function validateTypescriptExceptionRules(exceptions: unknown, preset: string | undefined): void {
  if (!TYPESCRIPT_PRESETS.includes(preset) || !Array.isArray(exceptions)) {
    return;
  }
  for (const [index, entry] of exceptions.entries()) {
    const rule = fieldOf(entry, 'rule');
    const problem = typeof rule === 'string' ? exceptionRuleProblem(rule, preset) : undefined;
    if (problem !== undefined) {
      throw configError(`"exceptions[${String(index)}].rule" names ${textOf(rule)}, ${problem}`);
    }
  }
}

function validateCustomAnalyzers(analyzers: unknown): void {
  if (!Array.isArray(analyzers)) {
    throw configError('"analyzers" must be an array');
  }
  for (const [index, entry] of analyzers.entries())
    validateCustomAnalyzerEntry(entry, `analyzers[${String(index)}]`);
}

function validateCustomAnalyzerEntry(entry: unknown, label: string): void {
  if (!isPlainObject(entry)) {
    throw configError(`"${label}" must be an object`);
  }
  for (const key of Object.keys(entry)) {
    if (!CUSTOM_ANALYZER_KEYS.includes(key)) {
      throw configError(
        `unknown key "${key}" in "${label}"${didYouMean(key, CUSTOM_ANALYZER_KEYS)}`,
      );
    }
  }
  if (!isNonEmptyString(entry['name']) || !isNonEmptyString(entry['command'])) {
    throw configError(`"${label}" needs a non-empty "name" and "command"`);
  }
  if (entry['args'] !== undefined) {
    validateStringArray(entry['args'], `${label}.args`);
  }
}
