const TYPESCRIPT_AND_JAVASCRIPT = {
  typescript: true,
  javascript: true,
  java: false,
  python: false,
  kotlin: false,
  go: false,
};

export const OWN_TOOL = 'own-tool';

const JVM = { java: true, kotlin: true };

const FEATURE_BOUNDARY_LANGUAGES = {
  typescript: OWN_TOOL,
  javascript: OWN_TOOL,
  java: false,
  python: true,
  kotlin: false,
  go: false,
};

const FEATURE_LAYOUT_SETTINGS = ['layout.sharedRoots', 'layout.featureRoots'];

export const FACT_RULE_LANGUAGES = {
  'duplicate-definition': { ...TYPESCRIPT_AND_JAVASCRIPT, ...JVM, javascript: 'partial' },
  'exported-name-collision': { ...TYPESCRIPT_AND_JAVASCRIPT, ...JVM, javascript: 'partial' },
  'sibling-copy-edit': { ...TYPESCRIPT_AND_JAVASCRIPT, ...JVM },
  'shared-used-by-one-feature': { ...TYPESCRIPT_AND_JAVASCRIPT, python: true },
  'feature-internal-import': { ...FEATURE_BOUNDARY_LANGUAGES },
  'shared-imports-feature': { ...FEATURE_BOUNDARY_LANGUAGES },
  'feature-cycle': { ...FEATURE_BOUNDARY_LANGUAGES },
  'test-only-export': { ...TYPESCRIPT_AND_JAVASCRIPT, java: true, kotlin: true },
  'doc-comment-content': { ...TYPESCRIPT_AND_JAVASCRIPT, java: true, kotlin: true },
  'test-console-output': { ...TYPESCRIPT_AND_JAVASCRIPT, java: true, kotlin: true },
};

export const FACT_RULE_LISTS = {
  'duplicate-definition': ['modules', 'packages', 'definitions', 'imports'],
  'exported-name-collision': ['modules', 'packages', 'definitions', 'imports'],
  'sibling-copy-edit': ['modules', 'packages', 'definitions'],
  'shared-used-by-one-feature': ['modules', 'imports'],
  'feature-internal-import': ['modules', 'imports'],
  'shared-imports-feature': ['modules', 'imports'],
  'feature-cycle': ['modules', 'imports'],
  'test-only-export': ['modules', 'packages', 'definitions', 'imports'],
  'doc-comment-content': ['docComments'],
  'test-console-output': ['console'],
};

export const FACT_RULE_SETTINGS = {
  'shared-used-by-one-feature': FEATURE_LAYOUT_SETTINGS,
  'feature-internal-import': FEATURE_LAYOUT_SETTINGS,
  'shared-imports-feature': FEATURE_LAYOUT_SETTINGS,
  'feature-cycle': FEATURE_LAYOUT_SETTINGS,
  'test-console-output': ['testConsole'],
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
