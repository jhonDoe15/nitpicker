import { describe, expect, it } from 'vitest';
import { formatTestFailures } from '../../quality-areas/reporting/test-report.mjs';
import { loadFailureReport, reportFromMocha } from './mocha-report.mjs';

const passed = {
  title: 'adds',
  fullTitle: 'math adds',
  file: '/p/test/a.js',
  duration: 3,
  err: {},
};
const failed = {
  title: 'subtracts',
  fullTitle: 'math subtracts',
  file: '/p/test/a.js',
  duration: 1,
  err: { message: 'expected 1', stack: 'AssertionError: expected 1\n    at x' },
};
const hook = {
  title: '"before all" hook in "db"',
  fullTitle: 'db "before all" hook in "db"',
  file: '/p/test/b.js',
  err: { message: 'no db' },
};

describe('the Mocha report', () => {
  it('groups the tests by file and keeps failing hooks', () => {
    const report = reportFromMocha(
      {
        tests: [passed, failed],
        failures: [failed, hook],
        pending: [],
      },
      '/p',
    );

    expect(report.numTotalTests).toBe(3);
    expect(report.numFailedTests).toBe(2);
    expect(report.testResults.map(({ name, status }) => [name, status])).toEqual([
      ['/p/test/a.js', 'failed'],
      ['/p/test/b.js', 'failed'],
    ]);
    expect(report.testResults[0].assertionResults[1]).toEqual({
      fullName: 'math subtracts',
      title: 'subtracts',
      status: 'failed',
      failureMessages: ['AssertionError: expected 1\n    at x'],
      duration: 1,
    });
    expect(report.testResults[1].assertionResults[0].failureMessages).toEqual(['no db']);
  });

  it('marks pending tests as neither passed nor failed', () => {
    const skipped = { ...passed, title: 'later', fullTitle: 'math later' };
    const report = reportFromMocha({ tests: [skipped], failures: [], pending: [skipped] }, '/p');

    expect(report.testResults[0].assertionResults[0].status).toBe('pending');
    expect(report.numFailedTests).toBe(0);
  });

  it('decides each test from its own entry when two files share a test title', () => {
    const passing = { ...passed, title: 'works', fullTitle: 'parse works', file: '/p/test/a.js' };
    const failing = { ...failed, title: 'works', fullTitle: 'parse works', file: '/p/test/b.js' };
    const skipped = { ...passed, title: 'later', fullTitle: 'parse later', file: '/p/test/a.js' };
    const kept = { ...skipped, file: '/p/test/b.js', err: failed.err };

    const report = reportFromMocha(
      { tests: [passing, skipped, failing, kept], failures: [failing, kept], pending: [skipped] },
      '/p',
    );

    expect(report.numFailedTests).toBe(2);
    expect(
      report.testResults.map(({ name, status, assertionResults }) => [
        name,
        status,
        assertionResults.map((assertion) => assertion.status),
      ]),
    ).toEqual([
      ['/p/test/a.js', 'passed', ['passed', 'pending']],
      ['/p/test/b.js', 'failed', ['failed', 'failed']],
    ]);
  });

  it('leaves the file of a root hook failure unnamed', () => {
    const rootHook = { title: '"before all" hook', fullTitle: '"before all" hook', err: hook.err };

    const report = reportFromMocha({ tests: [], failures: [rootHook], pending: [] }, '/p');

    expect(report.testResults).toEqual([
      {
        name: undefined,
        status: 'failed',
        message: '',
        assertionResults: [
          {
            fullName: '"before all" hook',
            title: '"before all" hook',
            status: 'failed',
            failureMessages: ['no db'],
            duration: undefined,
          },
        ],
      },
    ]);
    expect(formatTestFailures(report, '/p')).toBe(
      '1 test fails, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:\n' +
        '  <unknown test file> > "before all" hook: no db',
    );
  });
});

describe('the report of a Mocha run that stopped while loading the test files', () => {
  const files = ['/p/test/a.test.ts', '/p/test/broken.test.ts'];

  it('fails the test file the error names', () => {
    const stderr =
      "Exception during run: Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'x' imported from " +
      '/p/test/broken.test.ts\n    at packageResolve (node:internal)\n';

    expect(loadFailureReport(stderr, files)).toEqual({
      numTotalTests: 0,
      numFailedTests: 0,
      testResults: [
        {
          name: '/p/test/broken.test.ts',
          status: 'failed',
          message:
            "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'x' imported from /p/test/broken.test.ts\n" +
            '    at packageResolve (node:internal)',
          assertionResults: [],
        },
      ],
    });
  });

  it('fails the first test file when the error names none', () => {
    expect(loadFailureReport('Exception during run: Error: boom', files)?.testResults[0].name).toBe(
      '/p/test/a.test.ts',
    );
  });

  it('is not used when Mocha stopped for another reason', () => {
    expect(loadFailureReport('Error: unknown option --nope', files)).toBeUndefined();
  });
});
