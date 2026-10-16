import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { reportFromEvents } from './node-test-reporter.mjs';

const file = path.resolve('test/a.test.ts');

function event(type, name, nesting, details = {}, extra = {}) {
  return { type, data: { name, nesting, file, line: 3, column: 5, details, ...extra } };
}

const failure = (message) => ({
  type: 'test',
  duration_ms: 2,
  error: { failureType: 'testCodeFailure', cause: { message } },
});

describe('the node:test report', () => {
  it('names each test after its suites and keeps only the tests', () => {
    const report = reportFromEvents([
      event('test:pass', 'leaf', 2, { type: 'test', duration_ms: 1 }),
      event('test:pass', 'inner', 1, { type: 'suite' }),
      event('test:fail', 'breaks', 1, failure('expected 1 to be 2')),
      event('test:fail', 'outer', 0, {
        type: 'suite',
        error: { failureType: 'subtestsFailed' },
      }),
    ]);

    expect(report).toEqual({
      numTotalTests: 2,
      numFailedTests: 1,
      testResults: [
        {
          name: file,
          status: 'failed',
          message: '',
          assertionResults: [
            {
              fullName: 'outer inner leaf',
              title: 'leaf',
              status: 'passed',
              failureMessages: [],
              duration: 1,
              location: { line: 3, column: 5 },
            },
            {
              fullName: 'outer breaks',
              title: 'breaks',
              status: 'failed',
              failureMessages: ['expected 1 to be 2'],
              duration: 2,
              location: { line: 3, column: 5 },
            },
          ],
        },
      ],
    });
  });

  it('counts subtests instead of the test that holds them', () => {
    const report = reportFromEvents([
      event('test:pass', 'one', 1, { type: 'test' }),
      event('test:pass', 'holder', 0, { type: 'test' }),
      event('test:pass', 'skipped', 0, { type: 'test' }, { skip: true }),
    ]);

    expect(
      report.testResults[0].assertionResults.map(({ fullName, status }) => [fullName, status]),
    ).toEqual([
      ['holder one', 'passed'],
      ['skipped', 'pending'],
    ]);
  });

  it('reports a test file that could not load with the error it printed', () => {
    const report = reportFromEvents([
      {
        type: 'test:stderr',
        data: { file: 'test/a.test.ts', message: 'boot\nError: Cannot find package "x"\n' },
      },
      event('test:fail', 'test/a.test.ts', 0, failure('test failed')),
    ]);

    expect(report.numFailedTests).toBe(0);
    expect(report.testResults).toEqual([
      {
        name: file,
        status: 'failed',
        message:
          'Error: Cannot find package "x"\ntest failed\nboot\nError: Cannot find package "x"\n',
        assertionResults: [],
      },
    ]);
  });
});
