import { describe, expect, it } from 'vitest';
import { findingPath, formatTestFailures, testFailures } from './test-report.mjs';

const ROOT = '/work/project';

const report = {
  numFailedTests: 2,
  testResults: [
    {
      name: `${ROOT}/test/a.test.js`,
      status: 'failed',
      assertionResults: [
        { fullName: 'a returns one', status: 'passed', failureMessages: [] },
        {
          fullName: 'a returns two',
          status: 'failed',
          failureMessages: ['AssertionError: expected 1 to be 2\n  at x'],
        },
      ],
    },
    {
      name: `${ROOT}/test/b.test.js`,
      status: 'failed',
      assertionResults: [],
      message: 'Error: boom at load',
    },
  ],
};

describe('test failures', () => {
  it('lists failed assertions and files that could not run', () => {
    expect(testFailures(report, ROOT)).toEqual([
      {
        file: 'test/a.test.js',
        name: 'a returns two',
        assertion: 'AssertionError: expected 1 to be 2',
      },
      { file: 'test/b.test.js', name: 'could not run', assertion: 'Error: boom at load' },
    ]);
  });

  it('formats them under a headline that says what was skipped', () => {
    expect(formatTestFailures(report, ROOT)).toBe(
      [
        '2 tests fail, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:',
        '  test/a.test.js > a returns two: AssertionError: expected 1 to be 2',
        '  test/b.test.js > could not run: Error: boom at load',
      ].join('\n'),
    );
  });

  it('says so when the report names no test', () => {
    expect(formatTestFailures({ numFailedTests: 1, testResults: [] }, ROOT)).toBe(
      '1 test fails, so coverage, CRAP and mutation were skipped. Fix the tests and rerun; the report named no test.',
    );
  });

  it.each([
    ['test/a.test.js', 'test/a.test.js'],
    ['<unknown test file>', '.'],
    ['../outside.test.js', '.'],
    ['/elsewhere/a.test.js', '.'],
  ])('anchors the finding for %s at %s', (file, anchored) => {
    expect(findingPath(file)).toBe(anchored);
  });
});
