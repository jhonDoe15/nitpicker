import { describe, expect, it } from 'vitest';
import nitpickerTestReport, { buildReport } from './reporter.mjs';

const FILE = '/work/test/a.test.js';
const CRASHED = '/work/test/crash.test.js';

function failure(message) {
  return Object.assign(new Error('test failed'), {
    cause: new Error(message),
    failureType: 'testCodeFailure',
  });
}

async function reportFrom(list) {
  const chunks = [];
  for await (const chunk of nitpickerTestReport(list)) {
    chunks.push(chunk);
  }
  return chunks.map((chunk) => JSON.parse(chunk));
}

describe('the node:test reporter', () => {
  it('writes one Jest-shaped report for every file that ran', async () => {
    const reports = await reportFrom([
      {
        type: 'test:pass',
        data: { name: 'adds', nesting: 1, file: FILE, details: { type: 'test' } },
      },
      {
        type: 'test:fail',
        data: {
          name: 'subtracts',
          nesting: 1,
          file: FILE,
          details: { type: 'test', error: failure('Expected values to be strictly equal') },
        },
      },
      {
        type: 'test:fail',
        data: {
          name: 'math',
          nesting: 0,
          file: FILE,
          details: {
            type: 'suite',
            error: Object.assign(new Error('1 subtest failed'), { failureType: 'subtestsFailed' }),
          },
        },
      },
      {
        type: 'test:pass',
        data: { name: 'later', nesting: 1, file: FILE, skip: true, details: { type: 'test' } },
      },
      {
        type: 'test:pass',
        data: { name: 'planned', nesting: 1, file: FILE, todo: true, details: { type: 'test' } },
      },
      {
        type: 'test:pass',
        data: { name: 'math', nesting: 0, file: FILE, details: { type: 'suite' } },
      },
    ]);

    expect(reports).toEqual([
      {
        numTotalTests: 4,
        numFailedTests: 1,
        testResults: [
          {
            name: FILE,
            status: 'failed',
            message: '',
            assertionResults: [
              { fullName: 'adds', title: 'adds', status: 'passed', failureMessages: [] },
              {
                fullName: 'subtracts',
                title: 'subtracts',
                status: 'failed',
                failureMessages: ['Expected values to be strictly equal'],
              },
              { fullName: 'later', title: 'later', status: 'pending', failureMessages: [] },
              { fullName: 'planned', title: 'planned', status: 'todo', failureMessages: [] },
            ],
          },
        ],
      },
    ]);
  });

  it('reports a file that crashed while loading with the error it printed', async () => {
    const reports = await reportFrom([
      {
        type: 'test:stderr',
        data: {
          file: CRASHED,
          message: 'file:///work/test/crash.test.js:2\nthrow new Error("boom at load");\n^\n\n',
        },
      },
      {
        type: 'test:stderr',
        data: {
          file: CRASHED,
          message: 'Error: boom at load\n    at file:///work/test/crash.test.js:2:7\n',
        },
      },
      {
        type: 'test:fail',
        data: {
          name: 'test/crash.test.js',
          nesting: 0,
          file: CRASHED,
          details: { type: 'test', error: failure('test failed') },
        },
      },
    ]);

    expect(reports).toEqual([
      {
        numTotalTests: 0,
        numFailedTests: 0,
        testResults: [
          { name: CRASHED, status: 'failed', message: 'Error: boom at load', assertionResults: [] },
        ],
      },
    ]);
  });

  it('builds an empty report when nothing ran', () => {
    expect(buildReport(new Map())).toEqual({
      numTotalTests: 0,
      numFailedTests: 0,
      testResults: [],
    });
  });
});
