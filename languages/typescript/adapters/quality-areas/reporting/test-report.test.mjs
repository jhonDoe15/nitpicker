import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FAILING_TEST_FILES_PATH,
  failingTestFiles,
  hasPassingTests,
  readFailingTestFiles,
  testsFailedFinding,
} from './test-report.mjs';

const ROOT = '/p';

const REPORT = {
  numTotalTests: 3,
  numFailedTests: 2,
  testResults: [
    {
      name: '/p/test/b.test.ts',
      status: 'failed',
      assertionResults: [
        { status: 'failed', fullName: 'b one', failureMessages: ['AssertionError: nope'] },
        { status: 'passed', fullName: 'b two' },
      ],
    },
    {
      name: '/p/test/a.test.ts',
      status: 'failed',
      assertionResults: [
        { status: 'failed', fullName: 'a one', failureMessages: ['AssertionError: no'] },
      ],
    },
    { name: '/p/test/broken.test.ts', status: 'failed', assertionResults: [], message: 'boom' },
    { name: '/elsewhere/c.test.ts', status: 'failed', assertionResults: [], message: 'boom' },
  ],
};

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('failing test files', () => {
  it('lists each project test file with a failure once, sorted, and skips files outside the project', () => {
    expect(failingTestFiles(REPORT, ROOT)).toEqual([
      'test/a.test.ts',
      'test/b.test.ts',
      'test/broken.test.ts',
    ]);
  });

  it('counts a run with a passing test as having tests that ran', () => {
    expect(hasPassingTests(REPORT)).toBe(true);
    expect(hasPassingTests({ numTotalTests: 2, numFailedTests: 2 })).toBe(false);
    expect(hasPassingTests({ numTotalTests: 0, numFailedTests: 0 })).toBe(false);
  });

  it('reads the list the coverage run wrote and treats a missing file as empty', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-failing-'));
    roots.push(root);
    expect(readFailingTestFiles(root)).toEqual([]);
    mkdirSync(path.join(root, path.dirname(FAILING_TEST_FILES_PATH)), { recursive: true });
    writeFileSync(path.join(root, FAILING_TEST_FILES_PATH), '["test/a.test.ts", 3]');
    expect(readFailingTestFiles(root)).toEqual(['test/a.test.ts']);
  });
});

describe('the finding for a run that has failing tests but kept its coverage', () => {
  it('names the failing tests under the tests tool and says what still ran', () => {
    const finding = testsFailedFinding(
      { analyzerName: 'coverage', projectRoot: ROOT },
      { report: REPORT, runnerName: 'Vitest' },
    );

    expect(finding).toEqual({
      tool: 'tests',
      rule: 'tests-failed',
      path: 'test/b.test.ts',
      identity: 'tests-failed',
      classification: 'tool-error',
      message: [
        '4 tests fail. Coverage and CRAP come from the tests that ran, and mutation leaves out the test files that fail. Fix the tests and rerun:',
        '  test/b.test.ts > b one: AssertionError: nope',
        '  test/a.test.ts > a one: AssertionError: no',
        '  test/broken.test.ts > could not run: boom',
        '  /elsewhere/c.test.ts > could not run: boom',
      ].join('\n'),
    });
  });
});
