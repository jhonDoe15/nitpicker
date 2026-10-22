const TYPESCRIPT_AND_JAVASCRIPT = {
  typescript: true,
  javascript: true,
  java: false,
  python: false,
  kotlin: false,
};

export const OWN_TOOL = 'own-tool';

const FEATURE_BOUNDARY_LANGUAGES = {
  typescript: OWN_TOOL,
  javascript: OWN_TOOL,
  java: true,
  python: true,
  kotlin: true,
};

const FEATURE_LAYOUT_SETTINGS = ['layout.sharedRoots', 'layout.featureRoots'];

export const FACT_RULE_LANGUAGES = {
  'duplicate-definition': { ...TYPESCRIPT_AND_JAVASCRIPT, javascript: 'partial' },
  'exported-name-collision': { ...TYPESCRIPT_AND_JAVASCRIPT, javascript: 'partial' },
  'sibling-copy-edit': { ...TYPESCRIPT_AND_JAVASCRIPT },
  'shared-used-by-one-feature': {
    ...TYPESCRIPT_AND_JAVASCRIPT,
    java: true,
    python: true,
    kotlin: true,
  },
  'feature-internal-import': { ...FEATURE_BOUNDARY_LANGUAGES },
  'shared-imports-feature': { ...FEATURE_BOUNDARY_LANGUAGES },
  'feature-cycle': { ...FEATURE_BOUNDARY_LANGUAGES },
  'test-only-export': { ...TYPESCRIPT_AND_JAVASCRIPT, java: true, kotlin: true },
  'doc-comment-content': { ...TYPESCRIPT_AND_JAVASCRIPT },
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

export function factRuleSettings(language) {
  return [
    ...new Set(registeredFactRules(language).flatMap((rule) => FACT_RULE_SETTINGS[rule] ?? [])),
  ];
}

function column(value) {
  return value === OWN_TOOL ? true : value;
}

export function withLanguageColumns(rule, languages) {
  const registered = FACT_RULE_LANGUAGES[rule.id];
  const enforcedBy = Object.fromEntries(
    languages.map((language) => [
      language,
      registered === undefined
        ? (rule.enforcedBy[language] ?? rule.enforcedBy.typescript)
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
