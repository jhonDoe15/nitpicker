import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertGradleSucceeded } from './gradle-stage.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const TEST_TASK_OUTPUT =
  "FAILURE: Build failed with an exception.\n* What went wrong:\nExecution failed for task ':test'.\n> There were failing tests.";

describe('assertGradleSucceeded', () => {
  const failed = { status: 1, stderr: TEST_TASK_OUTPUT, stdout: '' };

  function reportsWith(suite) {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-reports-'));
    temporaryRoots.push(root);
    const results = path.join(root, 'build/test-results/test');
    mkdirSync(results, { recursive: true });
    writeFileSync(
      path.join(root, 'test-results.json'),
      JSON.stringify([{ dir: 'core', results: [results] }]),
    );
    writeFileSync(path.join(results, 'TEST-shop.CartTest.xml'), suite);
    return root;
  }

  function logRoot() {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-logs-'));
    temporaryRoots.push(root);
    return path.join(root, 'logs');
  }

  function thrownBy(result, reportBase, extra = {}) {
    try {
      assertGradleSucceeded(result, '/p', { reportBase, since: 0, ...extra });
    } catch (error) {
      return error;
    }
    return undefined;
  }

  it('does nothing for a run that succeeded', () => {
    expect(thrownBy({ status: 0, stdout: '', stderr: '' }, '/none')).toBeUndefined();
  });

  it('keeps the failing tests of each module on a failure whose test reports name them', () => {
    const reportBase = reportsWith(
      '<testsuite name="shop.CartTest"><testcase classname="shop.CartTest" name="adds"><failure message="no"/></testcase></testsuite>',
    );
    const logs = logRoot();
    const error = thrownBy({ ...failed, stderr: 'FAILURE: Build failed' }, reportBase, {
      policy: { logRoot: logs, logLabel: 'reports/logs', snapshot: 'head' },
    });

    expect(error.failures).toEqual([
      {
        module: 'core',
        tests: ['shop.CartTest.adds: no'],
        details: [{ name: 'shop.CartTest.adds', message: 'no' }],
      },
    ]);
    expect(error.message.split('\n').slice(0, -1)).toEqual([
      '1 test fails in core; the build stopped, so no other check ran. Fix the tests and rerun:',
      '  shop.CartTest.adds: no',
    ]);
    expect(error.message.split('\n').at(-1)).toBe(
      'Full Gradle log: reports/logs/java-head-gradle.log',
    );
    expect(readFileSync(path.join(logs, 'java-head-gradle.log'), 'utf8')).toContain(
      'FAILURE: Build failed',
    );
  });

  describe('on a build that succeeded', () => {
    const succeeded = { status: 0, stdout: '', stderr: '' };
    const FAILING_SUITE =
      '<testsuite name="shop.CartTest"><testcase classname="shop.CartTest" name="adds"><failure message="no"/></testcase><testcase classname="shop.CartTest" name="adds"/></testsuite>';

    it('still names a failing test its reports hold, as with ignoreFailures or a retry', () => {
      const error = thrownBy(succeeded, reportsWith(FAILING_SUITE));

      expect(error.failures).toEqual([
        {
          module: 'core',
          tests: ['shop.CartTest.adds: no'],
          details: [{ name: 'shop.CartTest.adds', message: 'no' }],
        },
      ]);
    });

    it('leaves the reports of an earlier run alone when it was told the tests are known to fail', () => {
      expect(
        thrownBy(succeeded, reportsWith(FAILING_SUITE), { checkTests: false }),
      ).toBeUndefined();
    });
  });

  it('is an ordinary build failure when a test task failed without naming a failing test', () => {
    const error = thrownBy(failed, '/none');

    expect(error.failures).toBeUndefined();
    expect(error.message).toBe(
      "Java preset failed on your change: Execution failed for task ':test'.\n> There were failing tests.",
    );
  });

  it('names the base and the Kotlin preset, and keeps the log after the message', () => {
    const logs = logRoot();
    const error = thrownBy(failed, '/none', {
      policy: { preset: 'kotlin', snapshot: 'base', logRoot: logs, logLabel: 'out/logs' },
    });

    expect(error.message.split('\n')).toEqual([
      "Kotlin preset failed on the base: Execution failed for task ':test'.",
      '> There were failing tests.',
      'Full Gradle log: out/logs/kotlin-base-gradle.log',
    ]);
  });

  it('carries the compile errors of the project for the runner to report as findings', () => {
    const error = thrownBy(
      {
        status: 1,
        stdout: '',
        stderr: '/p/src/main/java/demo/A.java:5: error: cannot find symbol',
      },
      '/none',
    );

    expect(error.compileErrors).toEqual([
      { path: 'src/main/java/demo/A.java', line: 5, message: 'cannot find symbol' },
    ]);
  });

  it('keeps a run that could not start apart from failing test reports', () => {
    const reportBase = reportsWith(
      '<testsuite name="shop.CartTest"><testcase classname="shop.CartTest" name="adds"><failure message="no"/></testcase></testsuite>',
    );
    const error = thrownBy({ error: new Error('timed out'), status: null }, reportBase);

    expect(error.failures).toBeUndefined();
    expect(error.message).toBe('timed out');
  });
});
