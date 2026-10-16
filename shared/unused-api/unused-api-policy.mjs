export const UNUSED_API_RULE_IDS = {
  unusedProp: 'unused-prop',
  unusedOption: 'unused-option',
  testOnlyExport: 'test-only-export',
};

/** Rules whose `exceptions` entries the analyzers (not ESLint) apply, in the TypeScript preset. */
export const UNUSED_API_EXCEPTION_RULES = Object.values(UNUSED_API_RULE_IDS);

export const UNUSED_API_SCOPES = {
  private: 'tests and stories do not count',
  published: 'tests, stories and examples of this package count',
};

const TYPESCRIPT_ONLY = { typescript: true, java: false, python: false, kotlin: false };

/** The catalog entries of `RULES` (see `shared/policy.mjs`) for the unused public surface rules. */
export const UNUSED_API_RULES = [
  {
    id: UNUSED_API_RULE_IDS.unusedProp,
    check: 'structure',
    limit:
      'React only: a prop the project declares that no caller passes (a spread of a non-literal passes all)',
    enforcedBy: TYPESCRIPT_ONLY,
  },
  {
    id: UNUSED_API_RULE_IDS.unusedOption,
    check: 'structure',
    limit:
      'a property of the options parameter of an exported function that no call sets (a non-literal argument sets all)',
    enforcedBy: TYPESCRIPT_ONLY,
  },
  {
    id: UNUSED_API_RULE_IDS.testOnlyExport,
    check: 'dead-code',
    limit:
      'an export or module that only tests import (a published package counts its own tests as callers, so it is not judged)',
    enforcedBy: TYPESCRIPT_ONLY,
  },
];
