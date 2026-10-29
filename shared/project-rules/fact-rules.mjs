const TYPESCRIPT_AND_JAVASCRIPT = {
  typescript: true,
  javascript: true,
  java: false,
  python: false,
  kotlin: false,
};

export const FACT_RULE_LANGUAGES = {
  'duplicate-definition': { ...TYPESCRIPT_AND_JAVASCRIPT, javascript: 'partial' },
  'exported-name-collision': { ...TYPESCRIPT_AND_JAVASCRIPT, javascript: 'partial' },
  'sibling-copy-edit': { ...TYPESCRIPT_AND_JAVASCRIPT },
  'shared-used-by-one-feature': { ...TYPESCRIPT_AND_JAVASCRIPT },
  'test-only-export': { ...TYPESCRIPT_AND_JAVASCRIPT, java: true, kotlin: true },
  'doc-comment-content': { ...TYPESCRIPT_AND_JAVASCRIPT, java: true, kotlin: true },
  'test-console-output': { ...TYPESCRIPT_AND_JAVASCRIPT, java: true, kotlin: true },
};

export const FACT_RULE_LISTS = {
  'duplicate-definition': ['modules', 'packages', 'definitions', 'imports'],
  'exported-name-collision': ['modules', 'packages', 'definitions', 'imports'],
  'sibling-copy-edit': ['modules', 'packages', 'definitions'],
  'shared-used-by-one-feature': ['modules', 'imports'],
  'test-only-export': ['modules', 'packages', 'definitions', 'imports'],
  'doc-comment-content': ['docComments'],
  'test-console-output': ['console'],
};

export const FACT_RULE_SETTINGS = {
  'shared-used-by-one-feature': ['layout.sharedRoots', 'layout.featureRoots'],
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
  return registeredFactRules(language).flatMap((rule) => FACT_RULE_SETTINGS[rule] ?? []);
}

export function withLanguageColumns(rule, languages) {
  const registered = FACT_RULE_LANGUAGES[rule.id];
  const enforcedBy = Object.fromEntries(
    languages.map((language) => [
      language,
      registered === undefined
        ? (rule.enforcedBy[language] ?? rule.enforcedBy.typescript)
        : registered[language],
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
