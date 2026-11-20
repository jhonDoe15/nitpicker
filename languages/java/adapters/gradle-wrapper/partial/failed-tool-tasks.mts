import { MODULE_BUILD_FAILED_RULE } from '../../../maven/reactor/failed-modules.mts';
import type { JavaFinding } from '../../typed/java-values.mts';

export type FailedToolTask = {
  readonly project: string;
  readonly task: string;
  readonly reason: string;
};
export type FailedToolTasks = { readonly tasks: FailedToolTask[]; error: unknown };
export type SkippedModule = { readonly path: string; readonly dir: string };

const WENT_WRONG = /\* What went wrong:\n(?<first>[^\n]*)(?<rest>(?:\n(?:> | {2,})[^\n]*)*)/gu;
const FAILED_TOOL_TASK =
  /^Execution failed for task '(?<project>(?::[\w.-]+)*):(?<task>nitpicker\w+)'/u;
const ROOT_PROJECT = ':';
const MAX_REASON_LENGTH = 600;

function reasonOf(first: string, rest: string): string {
  const detail = rest
    .split('\n')
    .map((line) => line.replace(/^>\s*/u, '').trim())
    .filter((line) => line !== '')
    .join(' ');
  const reason = detail === '' ? first : detail;
  return reason.length > MAX_REASON_LENGTH ? `${reason.slice(0, MAX_REASON_LENGTH)}...` : reason;
}

export function failedToolTasks(output: string): FailedToolTask[] | undefined {
  const problems = [...output.replaceAll('\r\n', '\n').matchAll(WENT_WRONG)];
  const tasks = problems.flatMap(({ groups }) => {
    const first = groups?.['first'] ?? '';
    const found = FAILED_TOOL_TASK.exec(first)?.groups;
    return found === undefined
      ? []
      : [
          {
            project: found['project'] === '' ? ROOT_PROJECT : (found['project'] ?? ROOT_PROJECT),
            task: found['task'] ?? '',
            reason: reasonOf(first, groups?.['rest'] ?? ''),
          },
        ];
  });
  return problems.length > 0 && tasks.length === problems.length ? tasks : undefined;
}

export function noteFailedToolTasks(
  noted: FailedToolTasks | undefined,
  { output, error }: { readonly output: string; readonly error: unknown },
): boolean {
  const tasks = noted === undefined ? undefined : failedToolTasks(output);
  if (noted === undefined || tasks === undefined) {
    return false;
  }
  const known = new Set(noted.tasks.map(({ project, task }) => `${project}:${task}`));
  noted.tasks.push(...tasks.filter(({ project, task }) => !known.has(`${project}:${task}`)));
  noted.error ??= error;
  return true;
}

export function failedProjects(noted: FailedToolTasks): ReadonlySet<string> {
  return new Set(noted.tasks.map(({ project }) => project));
}

export function skippedModuleFindings(
  skipped: readonly SkippedModule[],
  { tasks }: FailedToolTasks,
): JavaFinding[] {
  const failedNames = [...new Set(tasks.map(({ project }) => project))].join(', ');
  return skipped.map(({ path: project, dir }) => {
    const own = tasks.filter((task) => task.project === project);
    const cause =
      own.length === 0
        ? `it was not checked because a project it depends on failed (${failedNames})`
        : own.map(({ task, reason }) => `${task} failed: ${reason}`).join('; ');
    return {
      tool: 'gradle',
      rule: MODULE_BUILD_FAILED_RULE,
      path: dir === '' ? '.' : dir,
      identity: `${MODULE_BUILD_FAILED_RULE}:${project}`,
      message:
        `A nitpicker tool task failed in Gradle project ${project}, so its checks did not run; ` +
        `the other projects were checked. Gradle: ${cause}`,
      classification: 'tool-error',
    };
  });
}
