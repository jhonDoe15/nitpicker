import { MODULE_BUILD_FAILED_RULE as SHARED_MODULE_BUILD_FAILED_RULE } from '../../../../../shared/rules/finding-helpers.mjs';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import type { JavaFinding } from '../../typed/java-values.mts';

export type FailedToolTask = {
  readonly project: string;
  readonly task: string;
  readonly reason: string;
};
export type FailedToolTasks = {
  readonly tasks: readonly FailedToolTask[];
  readonly error: unknown;
  readonly stoppedAfterMinutes?: number | undefined;
};
export type FailedToolRecord = {
  current(): FailedToolTasks;
  noteTasks(found: FailedBuild): boolean;
  noteStopped(error: unknown): boolean;
};
type FailedBuild = { readonly output: string; readonly error: unknown };
export type SkippedModule = { readonly path: string; readonly dir: string };

const MODULE_BUILD_FAILED_RULE: string = SHARED_MODULE_BUILD_FAILED_RULE;
const WENT_WRONG = /\* What went wrong:\n(?<first>[^\n]*)(?<rest>(?:\n(?:> | {2})[^\n]*)*)/gu;
const FAILED_TOOL_TASK =
  /^Execution failed for task '(?<project>(?::[\w.-]+)*):(?<task>nitpicker\w+)'/u;
const ROOT_PROJECT = ':';
const MAX_REASON_LENGTH = 600;
const MAX_NAMED_PROJECTS = 10;
const DEADLINE_IDENTITY = 'deadline';

function reasonOf(first: string, rest: string): string {
  const detail = rest
    .split('\n')
    .map((line) => line.replace(/^>\s*/u, '').trim())
    .filter((line) => line !== '')
    .join(' ');
  const reason = detail === '' ? first : detail;
  const characters = Array.from(reason);
  return characters.length > MAX_REASON_LENGTH
    ? `${characters.slice(0, MAX_REASON_LENGTH).join('')}...`
    : reason;
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

function withFailedTasks(
  noted: FailedToolTasks,
  { output, error }: FailedBuild,
): FailedToolTasks | undefined {
  const tasks = failedToolTasks(output);
  if (tasks === undefined) {
    return undefined;
  }
  const known = new Set(noted.tasks.map(({ project, task }) => `${project}:${task}`));
  const added = tasks.filter(({ project, task }) => !known.has(`${project}:${task}`));
  return { ...noted, tasks: noted.tasks.concat(added), error: noted.error ?? error };
}

function withStoppedBuild(noted: FailedToolTasks, error: unknown): FailedToolTasks | undefined {
  const minutes = fieldOf(fieldOf(error, 'timedOut'), 'minutes');
  return typeof minutes === 'number'
    ? { ...noted, stoppedAfterMinutes: minutes, error: noted.error ?? error }
    : undefined;
}

export function failedToolRecord(): FailedToolRecord {
  let noted: FailedToolTasks = { tasks: [], error: undefined };
  function keep(next: FailedToolTasks | undefined): boolean {
    noted = next ?? noted;
    return next !== undefined;
  }
  return {
    current: () => noted,
    noteTasks: (found) => keep(withFailedTasks(noted, found)),
    noteStopped: (error) => keep(withStoppedBuild(noted, error)),
  };
}

export function failedProjects(noted: FailedToolTasks): ReadonlySet<string> {
  return new Set(noted.tasks.map(({ project }) => project));
}

function stoppedBuildFinding(skipped: readonly SkippedModule[], minutes: number): JavaFinding {
  const named = skipped.slice(0, MAX_NAMED_PROJECTS).map(({ path: project }) => project);
  const more = skipped.length - named.length;
  return {
    tool: 'gradle',
    rule: MODULE_BUILD_FAILED_RULE,
    path: '.',
    identity: `${MODULE_BUILD_FAILED_RULE}:${DEADLINE_IDENTITY}`,
    message:
      `Gradle was stopped at its ${String(minutes)}-minute deadline before the checks of ` +
      `${String(skipped.length)} Gradle projects finished (${named.join(', ')}` +
      `${more > 0 ? ` and ${String(more)} more` : ''}); the projects that finished were checked. ` +
      'Set NITPICKER_GRADLE_TIMEOUT_MINUTES to give each Gradle command more time',
    classification: 'tool-error',
  };
}

export function skippedModuleFindings(
  skipped: readonly SkippedModule[],
  { tasks, stoppedAfterMinutes }: FailedToolTasks,
): JavaFinding[] {
  if (stoppedAfterMinutes !== undefined && skipped.length > 0) {
    return [stoppedBuildFinding(skipped, stoppedAfterMinutes)];
  }
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
