const CRAP_RULE = 'crap-score-limit';
const CLASS_A = 'A.java';

export const COVERAGE_CASES = [
  [
    'plans an uncovered branch with the branch and the nearest test file',
    {
      identity: 'id',
      tool: 'jacoco',
      rule: 'changed-branch-coverage',
      path: 'src/a.ts',
      symbol: 'pick',
      location: { line: 2 },
      message:
        "Branch coverage is 50.00%; minimum is 95%. Not taken: else arm. Test it, or remove it if it can't happen.",
    },
    { 'src/a.ts': 'function pick(a) {\n  if (a) {\n    return 1;\n  }\n}\n', 'src/a.test.ts': '' },
    {
      finding: { tool: 'jacoco', rule: 'changed-branch-coverage', path: 'src/a.ts', line: 2 },
      kind: 'add-test-for-branch',
      target: { path: 'src/a.ts', symbol: 'pick', startLine: 2, endLine: 2 },
      context: {
        uncoveredLine: 2,
        source: 'if (a) {',
        percent: 50,
        notTaken: ['else arm'],
        testFile: { path: 'src/a.test.ts', exists: true },
      },
      steps: [
        'Read the branch at pick (src/a.ts:2), 50.00% covered.',
        'Write a test that takes each branch that is not taken: else arm.',
        'Add the test to src/a.test.ts.',
        'Add a test for each outcome it misses.',
        'Assert the result of each outcome, not only that the code ran.',
      ],
      doneWhen:
        'nitpicker reports no jacoco/changed-branch-coverage finding for pick (src/a.ts:2).',
    },
  ],
  [
    'suggests a test file when none exists',
    {
      identity: 'id',
      tool: 'crap',
      rule: 'crap-coverage-unknown',
      path: 'src/a.ts',
      symbol: 'run',
      location: { line: 1 },
      message: 'run has unknown coverage and no CRAP score: no test runs it.',
    },
    {},
    {
      finding: { tool: 'crap', rule: 'crap-coverage-unknown', path: 'src/a.ts', line: 1 },
      kind: 'add-test-for-branch',
      target: { path: 'src/a.ts', symbol: 'run', startLine: 1, endLine: 1 },
      context: { coverage: 'unknown', testFile: { path: 'src/a.test.ts', exists: false } },
      steps: [
        'Read run (src/a.ts:1): no test runs it.',
        'Create src/a.test.ts for the test, following the other test files of the project.',
        'Test its uncovered branches, or split a branchy part into its own function.',
        'Call it from the test and assert its results for each branch.',
      ],
      doneWhen: 'nitpicker reports no crap/crap-coverage-unknown finding for run (src/a.ts:1).',
    },
  ],
  [
    'asks to reduce complexity when tests already cover a CRAP function',
    {
      identity: 'id',
      tool: 'crap',
      rule: CRAP_RULE,
      path: 'a.ts',
      location: { line: 1 },
      message: 'f has CRAP 12.00 although tests cover it; score must be below 9.',
    },
    {},
    {
      finding: { tool: 'crap', rule: CRAP_RULE, path: 'a.ts', line: 1 },
      kind: 'reduce-complexity',
      target: { path: 'a.ts', startLine: 1, endLine: 1 },
      context: { crap: 12, limit: 9, testFile: { path: 'a.test.ts', exists: false } },
      steps: [
        'Read a.ts:1: 12 CRAP, limit 9; tests already cover it.',
        'Reduce its branches: split a branchy part into its own function.',
        'Keep the behavior: run its tests after each change.',
      ],
      doneWhen: 'nitpicker reports no crap/crap-score-limit finding for a.ts:1.',
    },
  ],
  [
    'asks for a test when tests do not cover a CRAP function',
    {
      identity: 'id',
      tool: 'crap',
      rule: CRAP_RULE,
      path: 'a.ts',
      location: { line: 1 },
      message: 'f has CRAP 30.00; score must be below 9.',
    },
    {},
    {
      finding: { tool: 'crap', rule: CRAP_RULE, path: 'a.ts', line: 1 },
      kind: 'add-test-for-branch',
      target: { path: 'a.ts', startLine: 1, endLine: 1 },
      context: { crap: 30, limit: 9, testFile: { path: 'a.test.ts', exists: false } },
      steps: [
        'Read a.ts:1: 30 CRAP, limit 9.',
        'Create a.test.ts for the test, following the other test files of the project.',
        'Test its uncovered branches, or split a branchy part into its own function.',
        'Call it from the test and assert its results for each branch.',
      ],
      doneWhen: 'nitpicker reports no crap/crap-score-limit finding for a.ts:1.',
    },
  ],
  [
    'plans a surviving mutant with the mutation and the line',
    {
      identity: 'id',
      tool: 'pit',
      rule: 'mutant-survived',
      path: 'src/a.ts',
      location: { line: 1, column: 12 },
      message:
        'Survived ConditionalBoundary at column 12: replacing `a > 1` with `a >= 1` fails no test. Add an assertion that would.',
    },
    { 'src/a.ts': 'return a > 1;\n' },
    {
      finding: { tool: 'pit', rule: 'mutant-survived', path: 'src/a.ts', line: 1 },
      kind: 'kill-mutant',
      target: { path: 'src/a.ts', startLine: 1, endLine: 1 },
      context: {
        mutator: 'ConditionalBoundary',
        column: 12,
        original: 'a > 1',
        replacement: 'a >= 1',
        source: 'return a > 1;',
        testFile: { path: 'src/a.test.ts', exists: false },
      },
      steps: [
        'Read src/a.ts:1: replacing a > 1 with a >= 1 fails no test.',
        'Create src/a.test.ts for the test, following the other test files of the project.',
        'Write an input for which the original and the mutated code give different results.',
        'Assert the exact value instead of only running the code.',
        'If no input can tell the two apart, simplify the code so this mutant disappears.',
      ],
      doneWhen: 'nitpicker reports no pit/mutant-survived finding for src/a.ts:1.',
    },
  ],
  [
    'plans a mutant that no test reaches as a test for the code',
    {
      identity: 'id',
      tool: 'pit',
      rule: 'mutant-nocoverage',
      path: CLASS_A,
      location: { line: 3 },
      message: 'NoCoverage MathMutator: no test runs this code. Add a test that reaches it.',
    },
    {},
    {
      finding: { tool: 'pit', rule: 'mutant-nocoverage', path: CLASS_A, line: 3 },
      kind: 'add-test-for-branch',
      target: { path: CLASS_A, startLine: 3, endLine: 3 },
      context: {
        mutator: 'MathMutator',
        testFile: { path: 'ATest.java', exists: false },
        unreached: true,
      },
      steps: [
        'Read A.java:3: no test runs this code.',
        'Create ATest.java for the test, following the other test files of the project.',
        'Add a test that reaches it.',
        'Assert the result, so that the mutants in this code fail the test.',
      ],
      doneWhen: 'nitpicker reports no pit/mutant-nocoverage finding for A.java:3.',
    },
  ],
];
