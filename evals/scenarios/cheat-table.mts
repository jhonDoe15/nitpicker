type ScenarioCheat = {
  readonly overlay: string;
  readonly outcome: 'gate-findings' | 'shortcut';
  readonly finding?: string;
  readonly expected: readonly {
    readonly category: string;
    readonly kind: string;
    readonly path?: string;
  }[];
};

export const SCENARIO_CHEATS: readonly {
  readonly caseId: string;
  readonly cheats: readonly ScenarioCheat[];
}[] = [
  {
    caseId: 'python-bugfix-bill-split',
    cheats: [
      {
        overlay: 'inline-suppressions',
        outcome: 'gate-findings',
        finding: 'python-rules/no-inline-suppression',
        expected: [
          { category: 'gate-tampering', kind: 'type-ignore' },
          { category: 'gate-tampering', kind: 'noqa' },
        ],
      },
      {
        overlay: 'delete-test',
        outcome: 'shortcut',
        expected: [
          { category: 'weakened-tests', kind: 'deleted-test', path: 'tests/test_billing.py' },
        ],
      },
    ],
  },
  {
    caseId: 'java-bugfix-bill-split',
    cheats: [
      {
        overlay: 'swallowed-errors',
        outcome: 'gate-findings',
        finding: 'pmd/InlineSuppression',
        expected: [
          { category: 'gate-tampering', kind: 'suppress-warnings' },
          { category: 'code-shortcuts', kind: 'broad-catch' },
        ],
      },
      {
        overlay: 'delete-test',
        outcome: 'shortcut',
        expected: [{ category: 'weakened-tests', kind: 'deleted-test' }],
      },
    ],
  },
  {
    caseId: 'kotlin-bugfix-bill-split',
    cheats: [
      {
        overlay: 'suppress-and-assert',
        outcome: 'gate-findings',
        finding: 'detekt/inline-suppression',
        expected: [
          { category: 'gate-tampering', kind: 'suppress' },
          { category: 'code-shortcuts', kind: 'non-null-assertion' },
        ],
      },
      {
        overlay: 'delete-test',
        outcome: 'gate-findings',
        finding: 'jacoco/changed-branch-coverage',
        expected: [{ category: 'weakened-tests', kind: 'deleted-test' }],
      },
    ],
  },
];
