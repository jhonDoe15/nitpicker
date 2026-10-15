import { expect } from 'vitest';
export function expectedOutput237_21() {
  return {
    tool: 'coverage',
    rule: 'tests-failed',
    path: '.',
    identity: 'tests-failed',
    message:
      '1 test fails, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:\n  /elsewhere/test/a.test.ts > adds: no',
    classification: 'tool-error',
  };
}

export function expectedOutput334_31() {
  return [
    {
      tool: 'invalid-priority',
      snapshot: 'head',
      message: 'invalid-priority executionPriority must be a non-negative safe integer',
    },
  ];
}

export function expectedOutput379_31() {
  return [
    {
      tool: 'coverage',
      snapshot: 'head',
      message: 'coverage crashed with exit 2: no diagnostic output',
    },
  ];
}

export function expectedOutput410_7() {
  return [
    {
      tool: 'coding-standards',
      rule: 'baseline-expansion',
      path: 'src/main/example.ts',
      identity: 'site:7faa3be0ab2f526b3a4562b4',
      message: 'Legacy allowance increased from 1 to 2 for example-rule',
      classification: 'enforceable',
    },
  ];
}

export function expectedOutput429_22() {
  return [
    {
      tool: 'coupling',
      rule: 'stability-direction',
      path: '.',
      identity: 'package-edge:stable->volatile',
      message: 'stable depends on less stable package volatile',
      classification: 'enforceable',
    },
    {
      tool: 'coupling',
      rule: 'stability-direction-metric',
      path: '.',
      identity: 'package-edge:stable->volatile',
      message: 'stable depends on less stable package volatile',
      classification: 'descriptive',
      metric: { name: 'instabilityDelta', value: 0.5 },
    },
  ];
}

export function expectedOutput436_22() {
  return [
    {
      tool: 'coupling',
      rule: 'stability-direction',
      path: '.',
      identity: 'package-edge:stable->volatile',
      message: 'stable depends on less stable package volatile',
      classification: 'enforceable',
    },
    {
      tool: 'coupling',
      rule: 'stability-direction-metric',
      path: '.',
      identity: 'package-edge:stable->volatile',
      message: 'stable depends on less stable package volatile',
      classification: 'descriptive',
      metric: { name: 'instabilityDelta', value: 0.5 },
    },
  ];
}

export function expectedOutput459_22() {
  return [
    {
      tool: 'test-runtime',
      rule: 'test-runtime',
      path: '.',
      identity: 'summary:discoveredTests',
      message: 'discoveredTests summary',
      classification: 'descriptive',
      metric: { name: 'discoveredTests', value: 1 },
    },
    {
      tool: 'test-runtime',
      rule: 'test-runtime',
      path: '.',
      identity: 'summary:analyzedTests',
      message: 'analyzedTests summary',
      classification: 'descriptive',
      metric: { name: 'analyzedTests', value: 1 },
    },
    {
      tool: 'test-runtime',
      rule: 'test-runtime',
      path: '.',
      identity: 'summary:excludedTests',
      message: 'excludedTests summary',
      classification: 'descriptive',
      metric: { name: 'excludedTests', value: 0 },
    },
    {
      tool: 'test-runtime',
      rule: 'test-runtime',
      path: '.',
      identity: 'summary:findings',
      message: 'findings summary',
      classification: 'descriptive',
      metric: { name: 'findings', value: 1 },
    },
    {
      tool: 'test-runtime',
      rule: 'category-count',
      path: '.',
      identity: 'category:no-production-runtime',
      message: 'Tests classified as no-production-runtime',
      classification: 'descriptive',
      metric: { name: 'no-production-runtime', value: 1 },
    },
    {
      tool: 'test-runtime',
      rule: 'no-production-runtime',
      path: 'tests/orphan.test.ts',
      identity: 'test:tests/orphan.test.ts:source:8d9c747345db8de18b883037',
      message: 'Test has no production runtime',
      classification: 'enforceable',
    },
  ];
}

export function expectedOutput483_7() {
  return [
    {
      tool: 'dead-code',
      rule: 'files',
      path: 'src/main/unused.ts',
      identity: 'file:src/main/unused.ts|source:83250426356270ef2c09e1be',
      message:
        'Unused file: src/main/unused.ts. Nothing imports it: delete it, or import it where it is needed.',
      classification: 'enforceable',
    },
    {
      tool: 'dead-code',
      rule: 'exports',
      path: 'src/main/unused.ts',
      identity: 'name:unusedValue|occurrence:1|source:83250426356270ef2c09e1be',
      message:
        'Export unusedValue is never imported. Remove `export`, or the declaration if nothing uses it.',
      classification: 'enforceable',
      location: { line: 4, column: 14 },
    },
    {
      tool: 'dead-code',
      rule: 'types',
      path: 'src/main/unused.ts',
      identity: 'name:UnusedType|occurrence:1|source:83250426356270ef2c09e1be',
      message:
        'Exported type UnusedType is never imported. Remove `export`, or the type if nothing uses it.',
      classification: 'enforceable',
      location: { line: 8, column: 13 },
    },
  ];
}

export function expectedOutput588_22() {
  return [
    {
      tool: 'duplicates',
      rule: 'duplicate-clone',
      path: 'src/main/a.ts',
      identity: 'pair:src/main/a.ts|src/main/b.ts:fragment:e3b0c44298fc1c149afbf4c8:occurrence:1',
      message:
        'This code repeats src/main/b.ts:7 (10 lines). Keep one copy and call it from both places.',
      classification: 'enforceable',
      location: { line: 2 },
    },
    {
      tool: 'duplicates',
      rule: 'duplicate-clone-size',
      path: 'src/main/a.ts',
      identity: 'pair:src/main/a.ts|src/main/b.ts:occurrence:1:lines',
      message: 'Duplicate with src/main/b.ts',
      classification: 'descriptive',
      metric: { name: 'lines', value: 10 },
      location: { line: 2 },
    },
    {
      tool: 'duplicates',
      rule: 'duplicate-clone-size',
      path: 'src/main/a.ts',
      identity: 'pair:src/main/a.ts|src/main/b.ts:occurrence:1:tokens',
      message: 'Duplicate with src/main/b.ts',
      classification: 'descriptive',
      metric: { name: 'tokens', value: 30 },
      location: { line: 2 },
    },
  ];
}

export function expectedOutput620_22() {
  return [
    {
      tool: 'duplicates',
      rule: 'duplicate-clone',
      path: 'src/main/a.ts',
      identity: 'pair:src/main/a.ts|src/main/z.ts:fragment:e3b0c44298fc1c149afbf4c8:occurrence:1',
      message:
        'This code repeats src/main/z.ts:2 (10 lines). Keep one copy and call it from both places.',
      classification: 'enforceable',
      location: { line: 7 },
    },
    {
      tool: 'duplicates',
      rule: 'duplicate-clone-size',
      path: 'src/main/a.ts',
      identity: 'pair:src/main/a.ts|src/main/z.ts:occurrence:1:lines',
      message: 'Duplicate with src/main/z.ts',
      classification: 'descriptive',
      metric: { name: 'lines', value: 10 },
      location: { line: 7 },
    },
    {
      tool: 'duplicates',
      rule: 'duplicate-clone-size',
      path: 'src/main/a.ts',
      identity: 'pair:src/main/a.ts|src/main/z.ts:occurrence:1:tokens',
      message: 'Duplicate with src/main/z.ts',
      classification: 'descriptive',
      metric: { name: 'tokens', value: 30 },
      location: { line: 7 },
    },
  ];
}

export function expectedOutput648_22() {
  return [
    {
      tool: 'coverage',
      rule: 'coverage',
      path: 'src/main/value.ts',
      identity: 'branches',
      message: 'Branch coverage for src/main/value.ts',
      classification: 'descriptive',
      metric: { name: 'branches', value: 50 },
    },
    {
      tool: 'coverage',
      rule: 'changed-branch-coverage',
      path: 'src/main/value.ts',
      identity: 'branch-source:branch-source:occurrence:1',
      message: 'Branch coverage is 50.00%; minimum is 95%',
      classification: 'enforceable',
    },
    {
      tool: 'coverage',
      rule: 'test-efficiency',
      path: '.',
      identity: 'covered-branches-per-test',
      message: 'Covered branch outcomes per test',
      classification: 'descriptive',
      metric: { name: 'coveredBranchesPerTest', value: 0.5 },
    },
    {
      tool: 'coverage',
      rule: 'test-efficiency',
      path: '.',
      identity: 'test-count',
      message: 'Executed test count',
      classification: 'descriptive',
      metric: { name: 'testCount', value: 2 },
    },
  ];
}

export function expectedOutput674_22() {
  return [
    {
      tool: 'coverage',
      rule: 'coverage',
      path: 'src/main/value.ts',
      identity: 'branches',
      message: 'Branch coverage for src/main/value.ts',
      classification: 'descriptive',
      metric: { name: 'branches', value: 50 },
    },
    {
      tool: 'coverage',
      rule: 'changed-branch-coverage',
      path: 'src/main/value.ts',
      identity: 'branch-source:branch-source:occurrence:1',
      message:
        "Branch coverage is 50.00%; minimum is 95%. Not taken: the false arm of the ?: at 3:29. Test it, or remove it if it can't happen.",
      classification: 'enforceable',
    },
  ];
}

export function expectedOutput757_36() {
  return [
    {
      tool: 'coverage',
      rule: 'changed-branch-coverage',
      path: 'src/main/value.ts',
      identity: 'branch-source:changed-branch-after:occurrence:1',
      message: 'Branch coverage is 50.00%; minimum is 95%',
      classification: 'enforceable',
    },
  ];
}

export function expectedOutput802_22() {
  return [
    {
      tool: 'mutation',
      rule: 'mutant-survived',
      path: 'src/main/value.ts',
      identity: 'BooleanLiteral|fcbcf165908dd18a9e49f7ff|42fa055d09edd207663e69f0|occurrence:1',
      message:
        'Survived BooleanLiteral at column 5: replacing this code with `false` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
      classification: 'enforceable',
      location: { line: 4, column: 5 },
    },
    {
      tool: 'mutation',
      rule: 'mutant-survived',
      path: 'src/main/value.ts',
      identity: 'BooleanLiteral|fcbcf165908dd18a9e49f7ff|42fa055d09edd207663e69f0|occurrence:2',
      message:
        'Survived BooleanLiteral at column 5: replacing this code with `false` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
      classification: 'enforceable',
      location: { line: 4, column: 5 },
    },
    {
      tool: 'mutation',
      rule: 'mutation-summary',
      path: '.',
      identity: 'status:Killed',
      message: 'Killed mutants',
      classification: 'descriptive',
      metric: { name: 'Killed', value: 1 },
    },
    {
      tool: 'mutation',
      rule: 'mutation-summary',
      path: '.',
      identity: 'status:Survived',
      message: 'Survived mutants',
      classification: 'descriptive',
      metric: { name: 'Survived', value: 2 },
    },
  ];
}

export function expectedOutput809_22() {
  return [
    {
      tool: 'mutation',
      rule: 'mutant-survived',
      path: 'src/main/value.ts',
      identity: 'BooleanLiteral|fcbcf165908dd18a9e49f7ff|42fa055d09edd207663e69f0|occurrence:1',
      message:
        'Survived BooleanLiteral at column 5: replacing this code with `false` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
      classification: 'enforceable',
      location: { line: 4, column: 5 },
    },
    {
      tool: 'mutation',
      rule: 'mutant-survived',
      path: 'src/main/value.ts',
      identity: 'BooleanLiteral|fcbcf165908dd18a9e49f7ff|42fa055d09edd207663e69f0|occurrence:2',
      message:
        'Survived BooleanLiteral at column 5: replacing this code with `false` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
      classification: 'enforceable',
      location: { line: 4, column: 5 },
    },
    {
      tool: 'mutation',
      rule: 'mutation-summary',
      path: '.',
      identity: 'status:Killed',
      message: 'Killed mutants',
      classification: 'descriptive',
      metric: { name: 'Killed', value: 1 },
    },
    {
      tool: 'mutation',
      rule: 'mutation-summary',
      path: '.',
      identity: 'status:Survived',
      message: 'Survived mutants',
      classification: 'descriptive',
      metric: { name: 'Survived', value: 2 },
    },
  ];
}

export function expectedOutput812_22() {
  return [
    {
      tool: 'mutation',
      rule: 'mutant-survived',
      path: 'src/main/value.ts',
      identity: 'BooleanLiteral|fcbcf165908dd18a9e49f7ff|42fa055d09edd207663e69f0|occurrence:1',
      message:
        'Survived BooleanLiteral at column 5: replacing this code with `false` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
      classification: 'enforceable',
      location: { line: 4, column: 5 },
    },
    {
      tool: 'mutation',
      rule: 'mutant-survived',
      path: 'src/main/value.ts',
      identity: 'BooleanLiteral|fcbcf165908dd18a9e49f7ff|42fa055d09edd207663e69f0|occurrence:2',
      message:
        'Survived BooleanLiteral at column 5: replacing this code with `false` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
      classification: 'enforceable',
      location: { line: 4, column: 5 },
    },
    {
      tool: 'mutation',
      rule: 'mutation-summary',
      path: '.',
      identity: 'status:Killed',
      message: 'Killed mutants',
      classification: 'descriptive',
      metric: { name: 'Killed', value: 1 },
    },
    {
      tool: 'mutation',
      rule: 'mutation-summary',
      path: '.',
      identity: 'status:Survived',
      message: 'Survived mutants',
      classification: 'descriptive',
      metric: { name: 'Survived', value: 2 },
    },
  ];
}

export function expectedOutput931_79() {
  return [
    {
      tool: 'crap',
      rule: 'crap-score-limit',
      path: 'src/main/value.ts',
      identity: 'function:value:occurrence:1:source:limit',
      message:
        'value has CRAP 9.00; score must be below 9. Test its uncovered branches, or split a branchy part into its own function.',
      classification: 'enforceable',
      symbol: 'value',
      location: { line: 1 },
      ratchet: {
        key: 'function:value:occurrence:1:crap',
        value: 9,
        worseMessage:
          'value CRAP rose from {base} to 9 (limit 9). Put new code in a new function and cover it with tests.',
        heldMessage:
          'value: CRAP 9.00 (limit 9), allowed because base was {base}; any increase fails.',
      },
    },
    {
      tool: 'crap',
      rule: 'function-crap',
      path: 'src/main/value.ts',
      identity: 'function:value:occurrence:1:complexity',
      message: 'complexity for value',
      classification: 'descriptive',
      metric: { name: 'complexity', value: 1 },
      symbol: 'value',
      location: { line: 1 },
    },
    {
      tool: 'crap',
      rule: 'function-crap',
      path: 'src/main/value.ts',
      identity: 'function:value:occurrence:1:statementCoverage',
      message: 'statementCoverage for value',
      classification: 'descriptive',
      metric: { name: 'statementCoverage', value: 100 },
      symbol: 'value',
      location: { line: 1 },
    },
    {
      tool: 'crap',
      rule: 'function-crap',
      path: 'src/main/value.ts',
      identity: 'function:value:occurrence:1:branchCoverage',
      message: 'branchCoverage for value',
      classification: 'descriptive',
      metric: { name: 'branchCoverage', value: 100 },
      symbol: 'value',
      location: { line: 1 },
    },
    {
      tool: 'crap',
      rule: 'function-crap',
      path: 'src/main/value.ts',
      identity: 'function:value:occurrence:1:effectiveCoverage',
      message: 'effectiveCoverage for value',
      classification: 'descriptive',
      metric: { name: 'effectiveCoverage', value: 100 },
      symbol: 'value',
      location: { line: 1 },
    },
    {
      tool: 'crap',
      rule: 'function-crap',
      path: 'src/main/value.ts',
      identity: 'function:value:occurrence:1:crap',
      message: 'crap for value',
      classification: 'descriptive',
      metric: { name: 'crap', value: 9 },
      symbol: 'value',
      location: { line: 1 },
    },
  ];
}

export function expectedOutput937_84() {
  return [
    {
      tool: 'crap',
      rule: 'crap-coverage-unknown',
      path: 'src/main/value.ts',
      identity: 'function:value:occurrence:1:source:unknown',
      message:
        'value has unknown coverage and no CRAP score: no test runs it. Add a test that calls it; for inline composition-root wiring, move it to a named function in adapters/ and test that.',
      classification: 'enforceable',
      symbol: 'value',
      location: { line: 1 },
    },
    {
      tool: 'crap',
      rule: 'function-crap',
      path: 'src/main/value.ts',
      identity: 'function:value:occurrence:1:complexity',
      message: 'complexity for value',
      classification: 'descriptive',
      metric: { name: 'complexity', value: 1 },
      symbol: 'value',
      location: { line: 1 },
    },
  ];
}

export function expectedOutput945_7() {
  return [
    {
      tool: 'crap',
      rule: 'crap-coverage-unknown',
      path: 'src/main/value.ts',
      identity: 'function:value:occurrence:1:source:missing',
      message:
        'value has unknown coverage and no CRAP score: no test runs it. Add a test that calls it; for inline composition-root wiring, move it to a named function in adapters/ and test that.',
      classification: 'enforceable',
      symbol: 'value',
      location: { line: 1 },
    },
    {
      tool: 'crap',
      rule: 'function-crap',
      path: 'src/main/value.ts',
      identity: 'function:value:occurrence:1:complexity',
      message: 'complexity for value',
      classification: 'descriptive',
      metric: { name: 'complexity', value: 1 },
      symbol: 'value',
      location: { line: 1 },
    },
    {
      tool: 'crap',
      rule: 'function-crap',
      path: 'src/main/value.ts',
      identity: 'function:value:occurrence:1:statementCoverage',
      message: 'statementCoverage for value',
      classification: 'descriptive',
      metric: { name: 'statementCoverage', value: 100 },
      symbol: 'value',
      location: { line: 1 },
    },
    {
      tool: 'crap',
      rule: 'function-crap',
      path: 'src/main/value.ts',
      identity: 'function:value:occurrence:1:branchCoverage',
      message: 'branchCoverage for value',
      classification: 'descriptive',
      metric: { name: 'branchCoverage', value: 100 },
      symbol: 'value',
      location: { line: 1 },
    },
    {
      tool: 'crap',
      rule: 'function-crap',
      path: 'src/main/value.ts',
      identity: 'function:value:occurrence:1:effectiveCoverage',
      message: 'effectiveCoverage for value',
      classification: 'descriptive',
      metric: { name: 'effectiveCoverage', value: 100 },
      symbol: 'value',
      location: { line: 1 },
    },
  ];
}

export function expectedOutput1011_7() {
  return [
    {
      tool: 'crap',
      rule: 'crap-score-limit',
      path: 'src/main/value.ts',
      identity: 'function:value:occurrence:1:source:changed',
      message:
        'value has CRAP 12.00; score must be below 12. Test its uncovered branches, or split a branchy part into its own function.',
      classification: 'enforceable',
      symbol: 'value',
      location: { line: 1 },
      ratchet: {
        key: 'function:value:occurrence:1:crap',
        value: 12,
        worseMessage:
          'value CRAP rose from {base} to 12 (limit 12). Put new code in a new function and cover it with tests.',
        heldMessage:
          'value: CRAP 12.00 (limit 12), allowed because base was {base}; any increase fails.',
      },
    },
    {
      tool: 'crap',
      rule: 'function-crap',
      path: 'src/main/value.ts',
      identity: 'function:value:occurrence:1:complexity',
      message: 'complexity for value',
      classification: 'descriptive',
      metric: { name: 'complexity', value: 2 },
      symbol: 'value',
      location: { line: 1 },
    },
    {
      tool: 'crap',
      rule: 'function-crap',
      path: 'src/main/value.ts',
      identity: 'function:value:occurrence:1:statementCoverage',
      message: 'statementCoverage for value',
      classification: 'descriptive',
      metric: { name: 'statementCoverage', value: 100 },
      symbol: 'value',
      location: { line: 1 },
    },
    {
      tool: 'crap',
      rule: 'function-crap',
      path: 'src/main/value.ts',
      identity: 'function:value:occurrence:1:branchCoverage',
      message: 'branchCoverage for value',
      classification: 'descriptive',
      metric: { name: 'branchCoverage', value: 100 },
      symbol: 'value',
      location: { line: 1 },
    },
    {
      tool: 'crap',
      rule: 'function-crap',
      path: 'src/main/value.ts',
      identity: 'function:value:occurrence:1:effectiveCoverage',
      message: 'effectiveCoverage for value',
      classification: 'descriptive',
      metric: { name: 'effectiveCoverage', value: 100 },
      symbol: 'value',
      location: { line: 1 },
    },
    {
      tool: 'crap',
      rule: 'function-crap',
      path: 'src/main/value.ts',
      identity: 'function:value:occurrence:1:crap',
      message: 'crap for value',
      classification: 'descriptive',
      metric: { name: 'crap', value: 12 },
      symbol: 'value',
      location: { line: 1 },
    },
  ];
}
