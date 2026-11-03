import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
    const error = thrownBy({ ...failed, stderr: 'FAILURE: Build failed' }, reportBase);

    expect(error.failures).toEqual([{ module: 'core', tests: ['shop.CartTest.adds: no'] }]);
    expect(error.message.split('\n').slice(1)).toEqual([
      'Tests fail in /p; nitpicker needs a passing test suite for coverage and mutation testing:',
      '  shop.CartTest.adds: no',
    ]);
  });

  describe('on a build that succeeded', () => {
    const succeeded = { status: 0, stdout: '', stderr: '' };
    const FAILING_SUITE =
      '<testsuite name="shop.CartTest"><testcase classname="shop.CartTest" name="adds"><failure message="no"/></testcase><testcase classname="shop.CartTest" name="adds"/></testsuite>';

    it('still names a failing test its reports hold, as with ignoreFailures or a retry', () => {
      const error = thrownBy(succeeded, reportsWith(FAILING_SUITE));

      expect(error.failures).toEqual([{ module: 'core', tests: ['shop.CartTest.adds: no'] }]);
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
    expect(error.message.split('\n').slice(1).join('\n')).toBe(
      `Java preset failed in /p: ${TEST_TASK_OUTPUT}`,
    );
  });

  it('keeps a run that could not start apart from failing test reports', () => {
    const reportBase = reportsWith(
      '<testsuite name="shop.CartTest"><testcase classname="shop.CartTest" name="adds"><failure message="no"/></testcase></testsuite>',
    );
    const error = thrownBy({ error: new Error('timed out'), status: null }, reportBase);

    expect(error.failures).toBeUndefined();
    expect(error.message.split('\n').slice(1)).toEqual(['timed out']);
  });
});
