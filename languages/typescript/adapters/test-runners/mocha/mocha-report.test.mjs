import { describe, expect, it } from 'vitest';
import { reportFromMocha } from './mocha-report.mjs';

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
});
