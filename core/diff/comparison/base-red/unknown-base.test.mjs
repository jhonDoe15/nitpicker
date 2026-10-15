import { describe, expect, it } from 'vitest';
import {
  baseNoteOf,
  changedByDiff,
  isBaseUnknown,
  isTestResultFinding,
  redBaseAnalyzers,
  testFailuresOf,
} from './unknown-base.mjs';

const testsFailed = {
  tool: 'coverage',
  rule: 'tests-failed',
  path: 'test/a.test.ts',
  identity: 'tests-failed',
  message: '1 test fails',
  classification: 'tool-error',
};
const skipped = { ...testsFailed, tool: 'mutation', rule: 'tests-failed-skipped' };
const crashed = { ...testsFailed, rule: 'python-failed' };
const lint = {
  tool: 'ruff',
  rule: 'F401',
  path: 'a.py',
  identity: 'a',
  message: 'unused',
  classification: 'enforceable',
};

function run({ reports = {}, toolErrors = [], skipped: skippedTools = {} }) {
  return {
    reports: new Map(Object.entries(reports).map(([name, findings]) => [name, { findings }])),
    toolErrors,
    skipped: new Map(Object.entries(skippedTools)),
  };
}

describe('which findings depend on test results', () => {
  it.each([
    ['crap-score-limit', true],
    ['crap-coverage-unknown', true],
    ['changed-branch-coverage', true],
    ['mutant-survived', true],
    ['mutant-nocoverage', true],
    ['mutant-timeout', true],
    ['function-lines-limit', false],
    ['no-production-runtime', false],
    ['F401', false],
  ])('%s: %s', (rule, expected) => {
    expect(isTestResultFinding({ ...lint, rule })).toBe(expected);
  });
});

describe('changedByDiff', () => {
  const touchedCode = {
    changedLines: new Map([
      ['added.py', { path: 'added.py', added: true, ranges: [[1, 40]], inserted: [] }],
      ['edited.py', { path: 'edited.py', added: false, ranges: [[10, 12]], inserted: [] }],
    ]),
  };
  const at = (path, location) => ({
    ...lint,
    path,
    ...(location === undefined ? {} : { location }),
  });

  it.each([
    ['a finding in an added file', at('added.py'), true],
    ['a finding on an edited line', at('edited.py', { line: 11 }), true],
    [
      'a finding in a function whose body has an edited line',
      at('edited.py', { line: 5, endLine: 10 }),
      true,
    ],
    [
      'a finding on an untouched line of an edited file',
      at('edited.py', { line: 20, endLine: 30 }),
      false,
    ],
    ['a finding without a location in an edited file', at('edited.py'), false],
    ['a finding in an untouched file', at('other.py', { line: 1 }), false],
  ])('%s', (_name, finding, expected) => {
    expect(changedByDiff(finding, touchedCode)).toBe(expected);
  });

  it('is false without any change information', () => {
    expect(changedByDiff(at('added.py'), undefined)).toBe(false);
  });
});

describe('testFailuresOf', () => {
  it('returns the tool errors when every one is a failing-tests rule', () => {
    expect(testFailuresOf({ findings: [lint, testsFailed, skipped] })).toEqual([
      testsFailed,
      skipped,
    ]);
  });

  it('returns nothing when another tool error comes with them', () => {
    expect(testFailuresOf({ findings: [testsFailed, crashed] })).toEqual([]);
  });

  it('returns nothing without a report or without a tool error', () => {
    expect([testFailuresOf(undefined), testFailuresOf({ findings: [lint] })]).toEqual([[], []]);
  });
});

describe('redBaseAnalyzers', () => {
  const names = ['coverage', 'ruff'];

  it('finds an analyzer whose base tests fail and whose head is clean', () => {
    const baseRun = run({ reports: { coverage: [testsFailed], ruff: [lint] } });
    const headRun = run({ reports: { coverage: [], ruff: [] } });

    expect(redBaseAnalyzers({ names, baseRun, headRun })).toEqual(
      new Map([['coverage', [testsFailed]]]),
    );
  });

  it.each([
    ['the head tests fail too', { reports: { coverage: [testsFailed] } }],
    [
      'the head analyzer crashed',
      { reports: { coverage: [] }, toolErrors: [{ tool: 'coverage' }] },
    ],
    ['the head analyzer has no report', { reports: {} }],
  ])('is empty when %s', (_name, head) => {
    const baseRun = run({ reports: { coverage: [testsFailed] } });

    expect(redBaseAnalyzers({ names, baseRun, headRun: run(head) })).toEqual(new Map());
  });

  it('is empty when the base analyzer crashed as well', () => {
    const baseRun = run({
      reports: { coverage: [testsFailed] },
      toolErrors: [{ tool: 'coverage' }],
    });

    expect(
      redBaseAnalyzers({ names, baseRun, headRun: run({ reports: { coverage: [] } }) }),
    ).toEqual(new Map());
  });
});

describe('isBaseUnknown', () => {
  const redBase = new Map([['coverage', [testsFailed]]]);
  const headRun = run({ reports: { coverage: [], crap: [] } });

  it('is true for the red analyzer and for one skipped because of it', () => {
    const baseRun = run({ reports: { coverage: [testsFailed] }, skipped: { crap: 'coverage' } });

    expect(
      ['coverage', 'crap', 'ruff'].map((name) =>
        isBaseUnknown({ name, baseRun, headRun, redBase }),
      ),
    ).toEqual([true, true, false]);
  });

  it('is false for an analyzer skipped because of another failure', () => {
    const baseRun = run({ skipped: { crap: 'duplicates' } });

    expect(isBaseUnknown({ name: 'crap', baseRun, headRun, redBase })).toBe(false);
  });

  it('is false when the head of the skipped analyzer did not run', () => {
    const baseRun = run({ skipped: { crap: 'coverage' } });

    expect(isBaseUnknown({ name: 'crap', baseRun, headRun: run({ reports: {} }), redBase })).toBe(
      false,
    );
  });
});

describe('baseNoteOf', () => {
  it('keeps what the report needs to explain the note', () => {
    expect(baseNoteOf('python', testsFailed)).toEqual({
      tool: 'python',
      snapshot: 'base',
      rule: 'tests-failed',
      path: 'test/a.test.ts',
      message: '1 test fails',
    });
  });
});
