export const UNUSED_API_RULE_IDS = {
  unusedProp: 'unused-prop',
  unusedOption: 'unused-option',
  testOnlyExport: 'test-only-export',
};

export const UNUSED_OPTION_SCOPES = {
  typescript: {
    private: 'tests and stories do not count',
    published: 'tests, stories and examples of this package count',
  },
  python: { private: 'tests do not count', published: "this package's own tests count" },
  kotlin: {
    private: 'tests do not count',
    published: "this module's own tests count",
    local: 'private or internal, so calls in tests count',
  },
};

const NO_OPTIONAL_INPUTS =
  'the language has no default parameter values or optional properties: an input a caller may leave out is a separate overload or builder method, not an option of one function';

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
      'an optional input no call sets, tests counting only when published: TypeScript, an options property ' +
      'of an exported function (a non-literal argument sets all); Python, an optional parameter (one with a ' +
      'default) of a public module-level function (no leading underscore, and listed in `__all__` when the ' +
      'module has a literal one); Kotlin, a defaulted parameter of a public top-level, object or companion ' +
      'function (not members or constructors, built by reflection) or of a private or internal function or ' +
      "constructor (its module's calls and tests)",
    enforcedBy: { ...TYPESCRIPT_AND_KOTLIN, python: true },
    notApplicable: { java: NO_OPTIONAL_INPUTS },
  },
  {
    id: UNUSED_API_RULE_IDS.testOnlyExport,
    check: 'dead-code',
    limit:
      'an export, module or main class that only tests use; a re-export is not an import (a published package or library counts its own tests as callers, so it is not judged)',
  },
];
