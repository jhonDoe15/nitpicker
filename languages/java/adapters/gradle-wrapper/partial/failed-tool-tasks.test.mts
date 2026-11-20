import { describe, expect, it } from 'vitest';
import {
  failedProjects,
  failedToolTasks,
  noteFailedToolTasks,
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
    const noted: FailedToolTasks = { tasks: [], error: undefined };
    const first = new Error('first');

    expect(noteFailedToolTasks(noted, { output: FORBIDDEN, error: first })).toBe(true);
    expect(noteFailedToolTasks(noted, { output: FORBIDDEN, error: new Error('second') })).toBe(
      true,
    );
    expect(noteFailedToolTasks(noted, { output: COMPILE, error: new Error('third') })).toBe(false);
    expect(noteFailedToolTasks(undefined, { output: FORBIDDEN, error: first })).toBe(false);

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
});
