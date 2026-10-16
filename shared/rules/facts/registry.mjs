export const FACT_RULE_LANGUAGES = {
  'duplicate-definition': ['typescript', 'javascript'],
  'exported-name-collision': ['typescript', 'javascript'],
  'sibling-copy-edit': ['typescript', 'javascript'],
  'shared-used-by-one-feature': ['typescript', 'javascript'],
  'test-only-export': ['typescript', 'javascript'],
  'doc-comment-content': ['typescript', 'javascript'],
  'test-console-output': ['typescript', 'javascript'],
};

export const FACT_RULE_LISTS = {
  'duplicate-definition': ['definitions', 'imports'],
  'exported-name-collision': ['definitions', 'imports'],
  'sibling-copy-edit': ['definitions'],
  'shared-used-by-one-feature': ['modules', 'imports'],
  'test-only-export': ['modules', 'definitions', 'imports'],
  'doc-comment-content': ['docComments'],
  'test-console-output': ['console'],
};

const JAVASCRIPT_DIFFERENCES = {
  'duplicate-definition': 'partial',
  'exported-name-collision': 'partial',
  'redefined-library-component': 'partial',
  'component-story-missing': 'partial',
  'unused-prop': false,
  'unused-option': false,
};

export function registeredFactRules(language) {
  return Object.entries(FACT_RULE_LANGUAGES)
    .filter(([, languages]) => languages.includes(language))
    .map(([rule]) => rule);
}

export function withLanguageColumns(rule, languages) {
  const registered = FACT_RULE_LANGUAGES[rule.id];
  const enforcedBy = Object.fromEntries(
    languages.map((language) => [
      language,
      registered === undefined
        ? (rule.enforcedBy[language] ?? rule.enforcedBy.typescript)
        : registered.includes(language),
    ]),
  );
  return {
    ...rule,
    enforcedBy: {
      ...enforcedBy,
      javascript: JAVASCRIPT_DIFFERENCES[rule.id] ?? enforcedBy.javascript,
    },
  };
}

export function sharedFactExceptionRules() {
  return Object.entries(FACT_RULE_LANGUAGES)
    .filter(([, languages]) =>
      languages.some((language) => !['typescript', 'javascript'].includes(language)),
    )
    .map(([rule]) => rule);
}
