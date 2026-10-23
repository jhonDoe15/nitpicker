export const UNUSED_API_RULE_IDS = {
  unusedProp: 'unused-prop',
  unusedOption: 'unused-option',
  testOnlyExport: 'test-only-export',
};

export const UNUSED_API_SCOPES = {
  private: 'tests and stories do not count',
  published: 'tests, stories and examples of this package count',
};

const TYPESCRIPT_ONLY = {
  typescript: true,
  javascript: false,
  java: false,
  python: false,
  kotlin: false,
};
const TYPESCRIPT_AND_KOTLIN = {
  typescript: true,
  javascript: false,
  java: false,
  python: false,
  kotlin: true,
};

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
      'a property of the options parameter of an exported function that no call sets (a non-literal argument sets all); Python: an optional parameter (one with a default) of a public module-level function (no leading underscore, and listed in `__all__` when the module has a literal one) that no call passes; Kotlin: a defaulted parameter of a private or internal function or constructor that no call names or fills by position',
    enforcedBy: { ...TYPESCRIPT_AND_KOTLIN, python: true },
  },
  {
    id: UNUSED_API_RULE_IDS.testOnlyExport,
    check: 'dead-code',
    limit:
      'an export, module or main class that only tests use; a re-export is not an import (a published package or library counts its own tests as callers, so it is not judged)',
  },
];
