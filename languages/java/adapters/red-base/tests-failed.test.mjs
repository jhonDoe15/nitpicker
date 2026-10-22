import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';
import {
  assertGradleSucceeded,
  gradleFailure,
  isBaseTestFailure,
  runOrNoteFailingTests,
  testsFailedFinding,
  withTestsFailure,
} from './tests-failed.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const TEST_TASK_OUTPUT =
  "FAILURE: Build failed with an exception.\n* What went wrong:\nExecution failed for task ':test'.\n> There were failing tests.";

function fakeGradle(stderrWithoutFlag) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-fake-gradle-'));
  temporaryRoots.push(root);
  const log = path.join(root, 'calls.log');
  const script = path.join(root, 'gradle');
  writeFileSync(
    script,
    `#!/bin/sh
echo "$@" >> '${log}'
case "$*" in
  *-Pnitpicker.testsFailed=true*) echo 'rerun failed' >&2 ;;
  *) echo "${stderrWithoutFlag}" >&2 ;;
esac
exit 1
`,
  );
  chmodSync(script, 0o755);
  const calls = () =>
    readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => line.includes('-Pnitpicker.testsFailed=true'));
  return { root, script, calls };
}

describe('gradleFailure', () => {
  it('marks a failed test task, in the root project or a module', () => {
    expect(gradleFailure('/p', TEST_TASK_OUTPUT).testsFailed).toBe(true);
    expect(gradleFailure('/p', "Execution failed for task ':app:test'.").testsFailed).toBe(true);
  });

  it('marks a failed Test task of any name, in the root project or a module', () => {
    const failing = (task) =>
      `* What went wrong:\nExecution failed for task '${task}'.\n> There were failing tests. See the report at: file:///p/build/reports/tests/index.html`;

    expect(
      [':integrationTest', ':app:functionalTest', ':jvmTest', ':app:testDebugUnitTest'].map(
        (task) => gradleFailure('/p', failing(task)).testsFailed,
      ),
    ).toEqual([true, true, true, true]);
  });

  it('does not mark a test source set that fails to compile', () => {
    expect(
      gradleFailure(
        '/p',
        "Execution failed for task ':compileIntegrationTestJava'.\n> Compilation failed; see the compiler output below.",
      ).testsFailed,
    ).toBe(false);
  });

  it('does not mark any other Gradle failure', () => {
    expect(gradleFailure('/p', "Execution failed for task ':compileJava'.").testsFailed).toBe(
      false,
    );
    expect(gradleFailure('/p', "Execution failed for task ':nitpickerPit'.").testsFailed).toBe(
      false,
    );
  });

  it('keeps the message and the raw detail', () => {
    const error = gradleFailure('/p', 'boom');

    expect({ message: error.message, detail: error.detail }).toEqual({
      message: 'Java preset failed in /p: boom',
      detail: 'boom',
    });
  });
});

describe('isBaseTestFailure', () => {
  it('is true only for a test failure on the base snapshot', () => {
    const failure = gradleFailure('/p', TEST_TASK_OUTPUT);
    const other = gradleFailure('/p', 'boom');

    expect([
      isBaseTestFailure(failure, { snapshot: 'base' }),
      isBaseTestFailure(failure, { snapshot: 'head' }),
      isBaseTestFailure(failure, undefined),
      isBaseTestFailure(other, { snapshot: 'base' }),
      isBaseTestFailure(new Error('x'), { snapshot: 'base' }),
    ]).toEqual([true, false, false, false, false]);
  });
});

describe('testsFailedFinding', () => {
  it('is a tool error of the preset, keeping a short message whole', () => {
    expect(testsFailedFinding('kotlin', 'boom')).toEqual({
      tool: 'kotlin',
      rule: 'tests-failed',
      path: '.',
      identity: 'tests-failed',
      message: 'boom',
      classification: 'tool-error',
    });
  });

  it('cuts a long message', () => {
    expect(testsFailedFinding('java', 'x'.repeat(5000)).message).toBe(`${'x'.repeat(4000)}...`);
  });
});

describe('collectJavaFindings on a failing Gradle build', () => {
  const collect = (fake, snapshot) =>
    collectJavaFindings(fake.root, {
      gradle: fake.script,
      policy: { preset: 'java', snapshot },
    });

  it('reruns a failed base without the test, coverage and mutation tasks, and reports the rerun failure', () => {
    const fake = fakeGradle(TEST_TASK_OUTPUT);

    expect(() => collect(fake, 'base')).toThrow('Java preset failed in');
    expect(fake.calls()).toEqual([false, true]);
  });

  it('does not rerun a failed head: a red head fails', () => {
    const fake = fakeGradle(TEST_TASK_OUTPUT);

    expect(() => collect(fake, 'head')).toThrow("Execution failed for task ':test'");
    expect(fake.calls()).toEqual([false]);
  });

  it('does not rerun a base that failed for another reason', () => {
    const fake = fakeGradle("Execution failed for task ':compileJava'.");

    expect(() => collect(fake, 'base')).toThrow("Execution failed for task ':compileJava'");
    expect(fake.calls()).toEqual([false]);
  });
});

describe('assertGradleSucceeded', () => {
  const failed = { status: 1, stderr: TEST_TASK_OUTPUT, stdout: '' };

  function reportsWith(suite) {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-reports-'));
    temporaryRoots.push(root);
    const results = path.join(root, 'build/test-results/test');
    mkdirSync(results, { recursive: true });
    writeFileSync(path.join(root, 'test-results.json'), JSON.stringify([results]));
    writeFileSync(path.join(results, 'TEST-shop.CartTest.xml'), suite);
    return root;
  }

  function thrownBy(result, reportBase) {
    try {
      assertGradleSucceeded(result, '/p', { reportBase, since: 0 });
    } catch (error) {
      return error;
    }
    return undefined;
  }

  it('does nothing for a run that succeeded', () => {
    expect(thrownBy({ status: 0, stdout: '', stderr: '' }, '/none')).toBeUndefined();
  });

  it('marks a failure whose test reports name failing tests and keeps their list as the detail', () => {
    const reportBase = reportsWith(
      '<testsuite name="shop.CartTest"><testcase classname="shop.CartTest" name="adds"><failure message="no"/></testcase></testsuite>',
    );
    const error = thrownBy({ ...failed, stderr: 'FAILURE: Build failed' }, reportBase);

    expect({ testsFailed: error.testsFailed, detail: error.detail }).toEqual({
      testsFailed: true,
      detail: 'Tests fail in /p:\n  shop.CartTest.adds: no',
    });
  });

  it('marks a failed test task from the Gradle output when there are no test reports', () => {
    const error = thrownBy(failed, '/none');

    expect({ testsFailed: error.testsFailed, detail: error.detail }).toEqual({
      testsFailed: true,
      detail: TEST_TASK_OUTPUT,
    });
  });

  it('does not mark a run that could not start, even beside failing test reports', () => {
    const reportBase = reportsWith(
      '<testsuite name="shop.CartTest"><testcase classname="shop.CartTest" name="adds"><failure message="no"/></testcase></testsuite>',
    );
    const error = thrownBy({ error: new Error('timed out'), status: null }, reportBase);

    expect(error.testsFailed).toBe(false);
  });
});

describe('runOrNoteFailingTests', () => {
  const failure = Object.assign(new Error('red'), { testsFailed: true });

  function runner(fails) {
    const calls = [];
    const run = (_root, options) => {
      calls.push(options.testsFailed === true);
      if (fails && options.testsFailed !== true) {
        throw failure;
      }
    };
    return { run, calls };
  }

  it('runs once and notes nothing when the build passes', () => {
    const { run, calls } = runner(false);

    expect([runOrNoteFailingTests(run, '/p', { policy: { snapshot: 'base' } }), calls]).toEqual([
      undefined,
      [false],
    ]);
  });

  it('reruns a red base without tests and returns the failure as the note', () => {
    const { run, calls } = runner(true);

    expect([runOrNoteFailingTests(run, '/p', { policy: { snapshot: 'base' } }), calls]).toEqual([
      failure,
      [false, true],
    ]);
  });

  it('lets a red head fail', () => {
    const { run, calls } = runner(true);

    expect(() => runOrNoteFailingTests(run, '/p', { policy: { snapshot: 'head' } })).toThrow(
      failure,
    );
    expect(calls).toEqual([false]);
  });
});

describe('withTestsFailure', () => {
  it('adds the tool error of the failing tests, or nothing when none failed', () => {
    const findings = [{ rule: 'x' }];

    expect([
      withTestsFailure(findings, 'java', undefined),
      withTestsFailure(findings, 'java', { detail: 'boom' }),
    ]).toEqual([findings, [...findings, testsFailedFinding('java', 'boom')]]);
  });
});
