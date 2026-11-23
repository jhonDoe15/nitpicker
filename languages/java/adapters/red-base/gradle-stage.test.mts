import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertGradleSucceeded } from './gradle-stage.mts';
import type { GradleResult } from '../gradle-wrapper/gradle-process.mts';
import type { JavaPolicy } from '../typed/java-values.mts';
import {
  type FailedToolRecord,
  failedToolRecord,
} from '../gradle-wrapper/partial/failed-tool-tasks.mts';
import { fieldOf, messageOf } from '../../../../shared/values/readers.mts';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const TEST_TASK_OUTPUT =
  "FAILURE: Build failed with an exception.\n* What went wrong:\nExecution failed for task ':test'.\n> There were failing tests.";

describe('assertGradleSucceeded', () => {
  const failed = { status: 1, stderr: TEST_TASK_OUTPUT, stdout: '' };

  function reportsWith(suite: string): string {
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

  function logRoot(): string {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-logs-'));
    temporaryRoots.push(root);
    return path.join(root, 'logs');
  }

  function thrownBy(
    result: GradleResult,
    reportBase: string,
    {
      projectRoot = '/p',
      ...extra
    }: {
      projectRoot?: string;
      policy?: JavaPolicy;
      checkTests?: boolean;
      failedTools?: FailedToolRecord;
    } = {},
  ): unknown {
    try {
      assertGradleSucceeded(result, projectRoot, {
        reportBase,
        since: 0,
        checkTests: true,
        command: 'gradle',
        budget: {},
        ...extra,
      });
    } catch (error) {
      return error;
    }
    return undefined;
  }

  it('does nothing for a run that succeeded', () => {
    expect(thrownBy({ status: 0, stdout: '', stderr: '' }, '/none')).toBeUndefined();
  });

  it('notes failed nitpicker tool tasks instead of failing, when the caller keeps partial results', () => {
    const tool = {
      status: 1,
      stdout: '',
      stderr:
        "FAILURE: Build failed with an exception.\n* What went wrong:\nExecution failed for task ':docs:nitpickerForbiddenApis'.\n> too long",
    };
    const failedTools = failedToolRecord();

    expect(thrownBy(tool, '/none', { failedTools })).toBeUndefined();
    expect(failedTools.current().tasks).toEqual([
      { project: ':docs', task: 'nitpickerForbiddenApis', reason: 'too long' },
    ]);
    expect([
      messageOf(failedTools.current().error),
      messageOf(thrownBy(tool, '/none')),
      messageOf(thrownBy(failed, '/none', { failedTools })),
    ]).toEqual([
      "Java preset failed on your change: Execution failed for task ':docs:nitpickerForbiddenApis'.\n> too long",
      "Java preset failed on your change: Execution failed for task ':docs:nitpickerForbiddenApis'.\n> too long",
      "Java preset failed on your change: Execution failed for task ':test'.\n> There were failing tests.",
    ]);
  });

  it('notes Gradle 9 task validation and script exceptions on nitpicker tasks, while failing on compileJava', () => {
    const cpdValidation = {
      status: 1,
      stdout: '',
      stderr:
        'FAILURE: Build failed with an exception.\n* What went wrong:\n' +
        "Some problems were found with the configuration of task ':clients:nitpickerCpd' (type 'DefaultTask').\n" +
        "  - Type 'DefaultTask' property 'outputDir' doesn't have a configured value.",
    };
    const pitScript = {
      status: 1,
      stdout: '',
      stderr:
        "FAILURE: Build failed with an exception.\n* Where:\nScript '/n/pit-task.gradle' line: 12\n" +
        "* What went wrong:\nExecution failed for task ':nitpickerPitTest' " +
        "(registered in script '/n/pit-task.gradle').\n" +
        '> Cannot invoke method on null object',
    };
    const compileFailure = {
      status: 1,
      stdout: '',
      stderr:
        'FAILURE: Build failed with an exception.\n* What went wrong:\n' +
        "Execution failed for task ':app:compileJava'.\n> Compilation failed",
    };
    const failedTools = failedToolRecord();

    expect(thrownBy(cpdValidation, '/none', { failedTools })).toBeUndefined();
    expect(thrownBy(pitScript, '/none', { failedTools })).toBeUndefined();
    expect(failedTools.current().tasks).toEqual([
      {
        project: ':clients',
        task: 'nitpickerCpd',
        reason: "Type 'DefaultTask' property 'outputDir' doesn't have a configured value.",
      },
      {
        project: ':',
        task: 'nitpickerPitTest',
        reason: 'Cannot invoke method on null object',
      },
    ]);
    expect(messageOf(thrownBy(compileFailure, '/none', { failedTools }))).toBe(
      "Java preset failed on your change: Execution failed for task ':app:compileJava'.\n> Compilation failed",
    );
  });

  it('keeps the failing tests of each module on a failure whose test reports name them', () => {
    const reportBase = reportsWith(
      '<testsuite name="shop.CartTest"><testcase classname="shop.CartTest" name="adds"><failure message="no"/></testcase></testsuite>',
    );
    const logs = logRoot();
    const error = thrownBy({ ...failed, stderr: 'FAILURE: Build failed' }, reportBase, {
      policy: { logRoot: logs, logLabel: 'reports/logs', snapshot: 'head' },
    });

    expect(fieldOf(error, 'failures')).toEqual([
      {
        module: 'core',
        tests: ['shop.CartTest.adds: no'],
        details: [{ name: 'shop.CartTest.adds', message: 'no' }],
      },
    ]);
    expect(messageOf(error).split('\n').slice(0, -1)).toEqual([
      '1 test fails in core; the build stopped, so no other check ran. Fix the tests and rerun:',
      '  shop.CartTest.adds: no',
    ]);
    expect(messageOf(error).split('\n').at(-1)).toBe(
      'Full Gradle log: reports/logs/java-head-gradle.log',
    );
    expect(readFileSync(path.join(logs, 'java-head-gradle.log'), 'utf8')).toBe(
      '=== stdout ===\n\n=== stderr ===\nFAILURE: Build failed',
    );
  });

  describe('on a build that succeeded', () => {
    const succeeded = { status: 0, stdout: '', stderr: '' };
    const FAILING_SUITE =
      '<testsuite name="shop.CartTest"><testcase classname="shop.CartTest" name="adds"><failure message="no"/></testcase><testcase classname="shop.CartTest" name="adds"/></testsuite>';

    it('still names a failing test its reports hold, as with ignoreFailures or a retry', () => {
      const error = thrownBy(succeeded, reportsWith(FAILING_SUITE));

      expect(fieldOf(error, 'failures')).toEqual([
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

    expect(fieldOf(error, 'failures')).toBeUndefined();
    expect(messageOf(error)).toBe(
      "Java preset failed on your change: Execution failed for task ':test'.\n> There were failing tests.",
    );
  });

  it('says that a rate-limited package repository is not a problem in the project', () => {
    const rateLimited = {
      status: 1,
      stdout: '',
      stderr:
        "FAILURE: Build failed with an exception.\n* What went wrong:\nCould not HEAD 'https://repo/a.pom'." +
        '\n> Received status code 429 from server: Too Many Requests',
    };

    expect(messageOf(thrownBy(rateLimited, '/none')).split('\n')).toEqual([
      "Java preset failed on your change: Could not HEAD 'https://repo/a.pom'.",
      '> Received status code 429 from server: Too Many Requests',
      'A package repository rate-limited the build (HTTP 429), so this is not a problem in the project: rerun later.',
    ]);
  });

  it('names the base and the Kotlin preset, and keeps the log after the message', () => {
    const logs = logRoot();
    const error = thrownBy(failed, '/none', {
      policy: { preset: 'kotlin', snapshot: 'base', logRoot: logs, logLabel: 'out/logs' },
    });

    expect(messageOf(error).split('\n')).toEqual([
      "Kotlin preset failed on the base: Execution failed for task ':test'.",
      '> There were failing tests.',
      'Full Gradle log: out/logs/kotlin-base-gradle.log',
    ]);
  });

  it('carries the compile errors of the project for the runner to report as findings', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-compile-'));
    temporaryRoots.push(root);
    mkdirSync(path.join(root, 'src/main/java/demo'), { recursive: true });
    writeFileSync(path.join(root, 'src/main/java/demo/A.java'), '\n');
    const error = thrownBy(
      { status: 1, stdout: '', stderr: 'src/main/java/demo/A.java:5: error: cannot find symbol' },
      '/none',
      { projectRoot: root },
    );

    expect(fieldOf(error, 'compileErrors')).toEqual([
      { path: 'src/main/java/demo/A.java', line: 5, message: 'cannot find symbol' },
    ]);
  });

  it('keeps a run that could not start apart from failing test reports', () => {
    const reportBase = reportsWith(
      '<testsuite name="shop.CartTest"><testcase classname="shop.CartTest" name="adds"><failure message="no"/></testcase></testsuite>',
    );
    const error = thrownBy({ error: new Error('timed out'), status: null }, reportBase);

    expect(fieldOf(error, 'failures')).toBeUndefined();
    expect(messageOf(error)).toBe('timed out');
  });
});
