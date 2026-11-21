import {
  DESIGN_RULE_LANGUAGES,
  DESIGN_RULE_LISTS,
  DESIGN_RULE_SETTINGS,
  DESIGN_RULES,
} from './design/design-rules.mts';
import type { ColumnedRule, Enforcement, LanguageColumns, RuleEntry } from './typed/rule-types.mts';

const MODULES = 'modules';
const PACKAGES = 'packages';
const DEFINITIONS = 'definitions';
const IMPORTS = 'imports';
const PARTIAL = 'partial';
const NEAR_DUPLICATE_UNITS = 'nearDuplicateUnits';

const TYPESCRIPT_AND_JAVASCRIPT = {
  typescript: true,
  javascript: true,
  java: false,
  python: false,
  kotlin: false,
  go: false,
};

export const OWN_TOOL = 'own-tool';

export const FEATURE_RULE_IDS = {
  featureInternalImport: 'feature-internal-import',
  sharedImportsFeature: 'shared-imports-feature',
  featureCycle: 'feature-cycle',
  foreignFeaturePersistence: 'foreign-feature-persistence',
};

const JVM = { java: true, kotlin: true };

const FEATURE_BOUNDARY_LANGUAGES: LanguageColumns = {
  typescript: OWN_TOOL,
  javascript: OWN_TOOL,
  java: true,
  python: true,
  kotlin: true,
  go: true,
};

const FEATURE_LAYOUT_SETTINGS = ['layout.sharedRoots', 'layout.featureRoots'];

export const FACT_RULE_LANGUAGES: Readonly<Record<string, LanguageColumns>> = {
  'duplicate-definition': {
    ...TYPESCRIPT_AND_JAVASCRIPT,
    ...JVM,
    javascript: PARTIAL,
    python: true,
    go: true,
  },
  'exported-name-collision': {
    ...TYPESCRIPT_AND_JAVASCRIPT,
    ...JVM,
    javascript: PARTIAL,
    python: true,
  },
  'sibling-copy-edit': { ...TYPESCRIPT_AND_JAVASCRIPT, ...JVM, python: true, go: true },
  'near-duplicate': { ...TYPESCRIPT_AND_JAVASCRIPT, ...JVM, python: true, go: true },
  'decided-condition': {
    ...TYPESCRIPT_AND_JAVASCRIPT,
    typescript: OWN_TOOL,
    javascript: OWN_TOOL,
    ...JVM,
    python: true,
    go: true,
  },
  'duplicate-branch': { ...TYPESCRIPT_AND_JAVASCRIPT, ...JVM, python: true, go: true },
  'result-slip': { ...TYPESCRIPT_AND_JAVASCRIPT, ...JVM, python: true, go: true },
  'integer-slip': {
    typescript: false,
    javascript: false,
    ...JVM,
    python: false,
    go: true,
  },
  'shorter-condition': {
    ...TYPESCRIPT_AND_JAVASCRIPT,
    typescript: OWN_TOOL,
    javascript: OWN_TOOL,
    ...JVM,
    python: true,
    go: true,
  },
  'shared-used-by-one-feature': { ...TYPESCRIPT_AND_JAVASCRIPT, ...JVM, python: true, go: true },
  'feature-internal-import': { ...FEATURE_BOUNDARY_LANGUAGES },
  'shared-imports-feature': { ...FEATURE_BOUNDARY_LANGUAGES },
  'feature-cycle': { ...FEATURE_BOUNDARY_LANGUAGES },
  'foreign-feature-persistence': {
    typescript: true,
    javascript: true,
    java: true,
    python: true,
    kotlin: true,
    go: false,
  },
  'public-alternative-bypass': {
    ...TYPESCRIPT_AND_JAVASCRIPT,
    python: true,
    kotlin: true,
    go: true,
  },
  'test-only-export': {
    ...TYPESCRIPT_AND_JAVASCRIPT,
    java: true,
    kotlin: true,
    python: true,
    go: true,
  },
  'doc-comment-content': {
    ...TYPESCRIPT_AND_JAVASCRIPT,
    java: true,
    kotlin: true,
    python: true,
    go: true,
  },
  'test-console-output': {
    ...TYPESCRIPT_AND_JAVASCRIPT,
    java: true,
    kotlin: true,
    python: true,
    go: true,
  },
  ...Object.fromEntries(DESIGN_RULES.map((rule) => [rule, { ...DESIGN_RULE_LANGUAGES[rule] }])),
};

export const FACT_RULE_LISTS: Readonly<Record<string, readonly string[]>> = {
  'duplicate-definition': [MODULES, PACKAGES, DEFINITIONS, IMPORTS],
  'exported-name-collision': [MODULES, PACKAGES, DEFINITIONS, IMPORTS],
  'sibling-copy-edit': [MODULES, PACKAGES, DEFINITIONS],
  'near-duplicate': [NEAR_DUPLICATE_UNITS],
  'decided-condition': [NEAR_DUPLICATE_UNITS],
  'duplicate-branch': [NEAR_DUPLICATE_UNITS],
  'result-slip': [NEAR_DUPLICATE_UNITS],
  'integer-slip': [NEAR_DUPLICATE_UNITS],
  'shorter-condition': [NEAR_DUPLICATE_UNITS],
  'shared-used-by-one-feature': [MODULES, IMPORTS],
  'feature-internal-import': [MODULES, IMPORTS],
  'shared-imports-feature': [MODULES, IMPORTS],
  'feature-cycle': [MODULES, IMPORTS],
  'public-alternative-bypass': [MODULES, IMPORTS],
  'foreign-feature-persistence': [MODULES, IMPORTS],
  'test-only-export': [MODULES, PACKAGES, DEFINITIONS, IMPORTS],
  'doc-comment-content': ['docComments'],
  'test-console-output': ['console'],
  ...DESIGN_RULE_LISTS,
};

export const FACT_RULE_SETTINGS: Readonly<Record<string, readonly string[]>> = {
  'shared-used-by-one-feature': FEATURE_LAYOUT_SETTINGS,
  'feature-internal-import': FEATURE_LAYOUT_SETTINGS,
  'shared-imports-feature': FEATURE_LAYOUT_SETTINGS,
  'feature-cycle': FEATURE_LAYOUT_SETTINGS,
  'foreign-feature-persistence': FEATURE_LAYOUT_SETTINGS,
  'test-console-output': ['testConsole'],
  ...DESIGN_RULE_SETTINGS,
};

const NATIVE_LANGUAGES = new Set(['typescript', 'javascript']);

function enforces(value: Enforcement | undefined): boolean {
  return value === true || value === PARTIAL;
}

export function registeredFactRules(language: string): string[] {
  return Object.entries(FACT_RULE_LANGUAGES)
    .filter(([, languages]) => enforces(languages[language]))
    .map(([rule]) => rule);
}

const OWN_RULE_SETTINGS: Readonly<
  Record<string, { readonly languages: readonly string[]; readonly settings: readonly string[] }>
> = {
  'contract-infrastructure-type': {
    languages: ['java', 'kotlin', 'python'],
    settings: FEATURE_LAYOUT_SETTINGS,
  },
};

function ownRuleSettings(language: string): string[] {
  return Object.values(OWN_RULE_SETTINGS)
    .filter(({ languages }) => languages.includes(language))
    .flatMap(({ settings }) => settings);
}

export function factRuleSettings(language: string): string[] {
  return [
    ...new Set([
      ...registeredFactRules(language).flatMap((rule) => FACT_RULE_SETTINGS[rule] ?? []),
      ...ownRuleSettings(language),
    ]),
  ];
}

function column(value: Enforcement | undefined): Enforcement | undefined {
  return value === OWN_TOOL ? true : value;
}

const OWN_COLUMN_LANGUAGES = new Set(['go']);

function defaultEnforcement(
  enforcedBy: LanguageColumns | undefined,
  language: string,
): Enforcement | undefined {
  return OWN_COLUMN_LANGUAGES.has(language) ? false : enforcedBy?.['typescript'];
}

export function withLanguageColumns(rule: RuleEntry, languages: readonly string[]): ColumnedRule {
  const registered = FACT_RULE_LANGUAGES[rule.id];
  const enforcedBy = Object.fromEntries(
    languages.map((language) => [
      language,
      registered === undefined
        ? (rule.enforcedBy?.[language] ?? defaultEnforcement(rule.enforcedBy, language))
        : column(registered[language]),
    ]),
  );
  return { ...rule, enforcedBy };
}

export function sharedFactExceptionRules(): string[] {
  return Object.entries(FACT_RULE_LANGUAGES)
    .filter(([, languages]) =>
      Object.entries(languages).some(
        ([language, value]) => !NATIVE_LANGUAGES.has(language) && enforces(value),
      ),
    )
    .map(([rule]) => rule);
}
