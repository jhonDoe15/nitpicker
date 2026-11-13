import {
  DESIGN_RULE_LANGUAGES,
  DESIGN_RULE_LISTS,
  DESIGN_RULE_SETTINGS,
  DESIGN_RULES,
} from './design/design-rules.mjs';

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

const FEATURE_BOUNDARY_LANGUAGES = {
  typescript: OWN_TOOL,
  javascript: OWN_TOOL,
  java: true,
  python: true,
  kotlin: true,
  go: true,
};

const FEATURE_LAYOUT_SETTINGS = ['layout.sharedRoots', 'layout.featureRoots'];

export const FACT_RULE_LANGUAGES = {
  'duplicate-definition': {
    ...TYPESCRIPT_AND_JAVASCRIPT,
    ...JVM,
    javascript: 'partial',
    python: true,
    go: true,
  },
  'exported-name-collision': {
    ...TYPESCRIPT_AND_JAVASCRIPT,
    ...JVM,
    javascript: 'partial',
    python: true,
  },
  'sibling-copy-edit': { ...TYPESCRIPT_AND_JAVASCRIPT, ...JVM, python: true, go: true },
  'near-duplicate': { ...TYPESCRIPT_AND_JAVASCRIPT, ...JVM, python: true },
  'decided-condition': {
    ...TYPESCRIPT_AND_JAVASCRIPT,
    typescript: OWN_TOOL,
    javascript: OWN_TOOL,
    ...JVM,
    python: true,
  },
  'duplicate-branch': { ...TYPESCRIPT_AND_JAVASCRIPT, ...JVM, python: true },
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
  'public-alternative-bypass': { ...TYPESCRIPT_AND_JAVASCRIPT, python: true, kotlin: true },
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

export const FACT_RULE_LISTS = {
  'duplicate-definition': ['modules', 'packages', 'definitions', 'imports'],
  'exported-name-collision': ['modules', 'packages', 'definitions', 'imports'],
  'sibling-copy-edit': ['modules', 'packages', 'definitions'],
  'near-duplicate': ['nearDuplicateUnits'],
  'decided-condition': ['nearDuplicateUnits'],
  'duplicate-branch': ['nearDuplicateUnits'],
  'shared-used-by-one-feature': ['modules', 'imports'],
  'feature-internal-import': ['modules', 'imports'],
  'shared-imports-feature': ['modules', 'imports'],
  'feature-cycle': ['modules', 'imports'],
  'public-alternative-bypass': ['modules', 'imports'],
  'foreign-feature-persistence': ['modules', 'imports'],
  'test-only-export': ['modules', 'packages', 'definitions', 'imports'],
  'doc-comment-content': ['docComments'],
  'test-console-output': ['console'],
  ...DESIGN_RULE_LISTS,
};

export const FACT_RULE_SETTINGS = {
  'shared-used-by-one-feature': FEATURE_LAYOUT_SETTINGS,
  'feature-internal-import': FEATURE_LAYOUT_SETTINGS,
  'shared-imports-feature': FEATURE_LAYOUT_SETTINGS,
  'feature-cycle': FEATURE_LAYOUT_SETTINGS,
  'foreign-feature-persistence': FEATURE_LAYOUT_SETTINGS,
  'test-console-output': ['testConsole'],
  ...DESIGN_RULE_SETTINGS,
};

const NATIVE_LANGUAGES = new Set(['typescript', 'javascript']);

function enforces(value) {
  return value === true || value === 'partial';
}

export function registeredFactRules(language) {
  return Object.entries(FACT_RULE_LANGUAGES)
    .filter(([, languages]) => enforces(languages[language]))
    .map(([rule]) => rule);
}

const OWN_RULE_SETTINGS = {
  'contract-infrastructure-type': {
    languages: ['java', 'kotlin', 'python'],
    settings: FEATURE_LAYOUT_SETTINGS,
  },
};

function ownRuleSettings(language) {
  return Object.values(OWN_RULE_SETTINGS)
    .filter(({ languages }) => languages.includes(language))
    .flatMap(({ settings }) => settings);
}

export function factRuleSettings(language) {
  return [
    ...new Set([
      ...registeredFactRules(language).flatMap((rule) => FACT_RULE_SETTINGS[rule] ?? []),
      ...ownRuleSettings(language),
    ]),
  ];
}

function column(value) {
  return value === OWN_TOOL ? true : value;
}

const OWN_COLUMN_LANGUAGES = new Set(['go']);

function defaultEnforcement(enforcedBy, language) {
  return OWN_COLUMN_LANGUAGES.has(language) ? false : enforcedBy.typescript;
}

export function withLanguageColumns(rule, languages) {
  const registered = FACT_RULE_LANGUAGES[rule.id];
  const enforcedBy = Object.fromEntries(
    languages.map((language) => [
      language,
      registered === undefined
        ? (rule.enforcedBy[language] ?? defaultEnforcement(rule.enforcedBy, language))
        : column(registered[language]),
    ]),
  );
  return { ...rule, enforcedBy };
}

export function sharedFactExceptionRules() {
  return Object.entries(FACT_RULE_LANGUAGES)
    .filter(([, languages]) =>
      Object.entries(languages).some(
        ([language, value]) => !NATIVE_LANGUAGES.has(language) && enforces(value),
      ),
    )
    .map(([rule]) => rule);
}
