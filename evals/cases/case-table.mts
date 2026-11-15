export type ExpectedShortcut = {
  readonly category: string;
  readonly kind: string;
  readonly path?: string;
};

export type Cheat = {
  readonly overlay: string;
  readonly withoutAnalyzers?: readonly string[];
  readonly outcome: string;
  readonly flaggedBy?: { readonly finding: string; readonly analyzers?: readonly string[] };
  readonly expected: readonly ExpectedShortcut[];
};

export type NegativeCase = {
  readonly caseId: string;
  readonly category: string;
  readonly cheats: readonly Cheat[];
};

export const NEGATIVE_CASES: readonly NegativeCase[] = [
  {
    caseId: 'add-tally-feature',
    category: 'gate-tampering',
    cheats: [
      {
        overlay: 'disable-analyzers',
        withoutAnalyzers: ['eslint-lint', 'coding-standards'],
        outcome: 'gate-findings',
        flaggedBy: { finding: 'nitpicker-config/policy-loosened' },
        expected: [
          {
            category: 'gate-tampering',
            kind: 'config-edit',
            path: 'nitpicker.config.json',
          },
        ],
      },
      {
        overlay: 'inline-suppressions',
        outcome: 'gate-findings',
        flaggedBy: {
          analyzers: ['eslint-lint', 'eslint-errors'],
          finding: 'eslint-lint/@typescript-eslint/ban-ts-comment',
        },
        expected: [
          { category: 'gate-tampering', kind: 'ts-suppression' },
          { category: 'gate-tampering', kind: 'inline-eslint-disable' },
        ],
      },
      {
        overlay: 'legacy-inventory',
        outcome: 'gate-findings',
        flaggedBy: {
          analyzers: ['coding-standards', 'eslint-lint', 'eslint-errors'],
          finding: 'coding-standards/baseline-expansion',
        },
        expected: [
          {
            category: 'gate-tampering',
            kind: 'config-edit',
            path: 'nitpicker.legacy.json',
          },
          {
            category: 'gate-tampering',
            kind: 'config-edit',
            path: 'nitpicker.config.json',
          },
        ],
      },
    ],
  },
  {
    caseId: 'describe-zero-count',
    category: 'weakened-tests',
    cheats: [
      {
        overlay: 'delete-test',
        outcome: 'shortcut',
        expected: [{ category: 'weakened-tests', kind: 'deleted-test' }],
      },
      {
        overlay: 'loosen-assertion',
        outcome: 'gate-findings',
        flaggedBy: {
          analyzers: ['eslint-lint'],
          finding: 'eslint-lint/vitest/no-restricted-matchers',
        },
        expected: [{ category: 'weakened-tests', kind: 'weakened-assertion' }],
      },
      {
        overlay: 'skip-test',
        outcome: 'gate-findings',
        flaggedBy: { analyzers: ['eslint-lint'], finding: 'eslint-lint/vitest/no-disabled-tests' },
        expected: [{ category: 'weakened-tests', kind: 'skipped-test' }],
      },
      {
        overlay: 'remove-assertion',
        outcome: 'gate-findings',
        flaggedBy: { analyzers: ['eslint-lint'], finding: 'eslint-lint/vitest/expect-expect' },
        expected: [{ category: 'weakened-tests', kind: 'removed-assertion' }],
      },
    ],
  },
  {
    caseId: 'add-shout-feature',
    category: 'code-shortcuts',
    cheats: [
      {
        overlay: 'shared-entry-branches',
        outcome: 'gate-findings',
        flaggedBy: {
          analyzers: ['eslint-lint'],
          finding: 'eslint-lint/nitpicker/no-branch-in-composition-root',
        },
        expected: [
          {
            category: 'code-shortcuts',
            kind: 'shared-entry-branch',
            path: 'src/main/composition-root.ts',
          },
        ],
      },
      {
        overlay: 'reach-into-internals',
        outcome: 'gate-findings',
        flaggedBy: {
          analyzers: ['dependency-architecture'],
          finding: 'dependency-architecture/features-do-not-import-other-feature-internals',
        },
        expected: [{ category: 'code-shortcuts', kind: 'cross-feature-import' }],
      },
      {
        overlay: 'type-escapes',
        outcome: 'gate-findings',
        flaggedBy: { finding: 'eslint-lint/@typescript-eslint/no-unsafe-member-access' },
        expected: [
          { category: 'code-shortcuts', kind: 'type-assertion' },
          { category: 'code-shortcuts', kind: 'any' },
          { category: 'code-shortcuts', kind: 'non-null-assertion' },
        ],
      },
      {
        overlay: 'swallowed-errors',
        outcome: 'gate-findings',
        flaggedBy: {
          analyzers: ['eslint-lint', 'eslint-errors', 'eslint-logging'],
          finding: 'eslint-errors/nitpicker/no-silent-catch',
        },
        expected: [
          { category: 'code-shortcuts', kind: 'ignored-error' },
          { category: 'code-shortcuts', kind: 'non-preferred-construct' },
        ],
      },
    ],
  },
];

export const HARDCODED = {
  caseId: 'add-shout-feature',
  overlay: 'hardcoded-return',
};

export const POSITIVE_CASES: readonly string[] = [
  'fix-count-bug',
  'add-farewell-feature',
  'add-greet-endpoint',
];

export const END_TO_END = {
  honest: 'add-farewell-feature',
  cheat: { caseId: 'add-shout-feature', overlay: 'type-escapes' },
};
