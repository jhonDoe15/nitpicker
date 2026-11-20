import { describe, expect, it } from 'vitest';
import {
  failedProjects,
  failedToolTasks,
  failedToolRecord,
  skippedModuleFindings,
} from './failed-tool-tasks.mts';
import type { FailedToolTasks } from './failed-tool-tasks.mts';

const TOO_LONG =
  "> Process 'command '/jdk/bin/java'' could not be started because the command line exceed operating system limits.";

function failure(index: number, first: string, detail: string): string {
  return [
    `${String(index)}: Task failed with an exception.`,
    '-----------',
    '* Where:',
    "Script '/n/lint-tasks.gradle' line: 32",
    '',
    '* What went wrong:',
    first,
    detail,
    '',
    '* Try:',
    '> Run with --stacktrace option to get the stack trace.',
    '==============================================================================',
  ].join('\n');
}

const FORBIDDEN = failure(
  1,
  "Execution failed for task ':docs:processor:nitpickerForbiddenApis' (registered in script '/n/lint-tasks.gradle').",
  TOO_LONG,
);
const ROOT_PMD = failure(
  2,
  "Execution failed for task ':nitpickerPmd'.",
  '> PMD failed\n   with exit code 5',
);
const COMPILE = failure(
  2,
  "Execution failed for task ':core:compileJava'.",
  '> Compilation failed; see the compiler output below.',
);

describe('failed nitpicker tool tasks in a Gradle failure', () => {
  it('lists each failed tool task with its project and reason', () => {
    const output = `FAILURE: Build completed with 2 failures.\n\n${FORBIDDEN}\n\n${ROOT_PMD}\n`;

    expect(failedToolTasks(output)).toEqual([
      {
        project: ':docs:processor',
        task: 'nitpickerForbiddenApis',
        reason:
          "Process 'command '/jdk/bin/java'' could not be started because the command line exceed operating system limits.",
      },
      { project: ':', task: 'nitpickerPmd', reason: 'PMD failed with exit code 5' },
    ]);
  });

  it('does not treat a build as partly checked when anything else failed too', () => {
    expect(
      failedToolTasks(`FAILURE: Build completed with 2 failures.\n\n${FORBIDDEN}\n\n${COMPILE}\n`),
    ).toBe(undefined);
    expect(failedToolTasks('FAILURE: Build failed with an exception.\nno details')).toBe(undefined);
    expect(
      failedToolTasks(
        "* What went wrong:\nA problem occurred configuring project ':core'.\n> Boom",
      ),
    ).toBe(undefined);
  });

  it('notes the tasks once across reruns and keeps the first error', () => {
    const record = failedToolRecord();
    const first = new Error('first');

    expect(record.noteTasks({ output: FORBIDDEN, error: first })).toBe(true);
    expect(record.noteTasks({ output: FORBIDDEN, error: new Error('second') })).toBe(true);
    expect(record.noteTasks({ output: COMPILE, error: new Error('third') })).toBe(false);

    const noted = record.current();
    expect([noted.tasks.length, noted.error, [...failedProjects(noted)]]).toEqual([
      1,
      first,
      [':docs:processor'],
    ]);
  });

  it('reports each skipped project as a tool error, with the failed task or the project it waited for', () => {
    const noted: FailedToolTasks = { tasks: failedToolTasks(FORBIDDEN) ?? [], error: undefined };

    expect(
      skippedModuleFindings(
        [
          { path: ':docs:processor', dir: 'docs/processor' },
          { path: ':app', dir: 'app' },
        ],
        noted,
      ),
    ).toEqual([
      {
        tool: 'gradle',
        rule: 'module-build-failed',
        path: 'docs/processor',
        identity: 'module-build-failed::docs:processor',
        message:
          'A nitpicker tool task failed in Gradle project :docs:processor, so its checks did not run; the other ' +
          "projects were checked. Gradle: nitpickerForbiddenApis failed: Process 'command '/jdk/bin/java'' could " +
          'not be started because the command line exceed operating system limits.',
        classification: 'tool-error',
      },
      {
        tool: 'gradle',
        rule: 'module-build-failed',
        path: 'app',
        identity: 'module-build-failed::app',
        message:
          'A nitpicker tool task failed in Gradle project :app, so its checks did not run; the other projects ' +
          'were checked. Gradle: it was not checked because a project it depends on failed (:docs:processor)',
        classification: 'tool-error',
      },
    ]);
  });

  it('reports a build stopped at its deadline once, naming the projects it did not reach', () => {
    const record = failedToolRecord();
    const stopped = Object.defineProperty(new Error('stopped'), 'timedOut', {
      value: { build: 'Gradle', minutes: 20 },
    });
    const skipped = Array.from({ length: 12 }, (_, index) => ({
      path: `:m${String(index)}`,
      dir: `m${String(index)}`,
    }));

    expect([record.noteStopped(new Error('other')), record.current().stoppedAfterMinutes]).toEqual([
      false,
      undefined,
    ]);
    expect([record.noteStopped(stopped), record.current().error]).toEqual([true, stopped]);
    const noted = record.current();
    expect(skippedModuleFindings(skipped, noted)).toEqual([
      {
        tool: 'gradle',
        rule: 'module-build-failed',
        path: '.',
        identity: 'module-build-failed:deadline',
        message:
          'Gradle was stopped at its 20-minute deadline before the checks of 12 Gradle projects finished ' +
          '(:m0, :m1, :m2, :m3, :m4, :m5, :m6, :m7, :m8, :m9 and 2 more); the projects that finished were ' +
          'checked. Set NITPICKER_GRADLE_TIMEOUT_MINUTES to give each Gradle command more time',
        classification: 'tool-error',
      },
    ]);
    expect(skippedModuleFindings([], noted)).toEqual([]);
  });
});
