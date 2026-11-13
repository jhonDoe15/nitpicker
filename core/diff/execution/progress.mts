import { writeSync } from 'node:fs';
import { displayPath } from '../../../shared/messages/terminal/terminal-text.mjs';
import { textOf } from '../../../shared/values/readers.mts';

export type ProgressStream = {
  readonly write: (text: string) => unknown;
  readonly fd?: unknown;
};

type TaskProgress = { readonly stream: ProgressStream; readonly label: string };

export type RunTaskOptions = {
  readonly snapshot: string;
  readonly progress?: TaskProgress;
};

export type RunTasks = (
  tasks: readonly object[],
  headPolicyFile: unknown,
  options: RunTaskOptions,
) => unknown;

type SettledTask = {
  readonly name: string;
  readonly status: string;
  readonly elapsedMs: number | undefined;
  readonly because?: string | undefined;
};

const shownPath: (absolutePath: unknown) => unknown = displayPath;

const PROGRESS_FD = 3;

const SECONDS_PER_MINUTE = 60;

export function formatDuration(elapsedMs: number): string {
  const seconds = Math.round(elapsedMs / 1000);
  if (seconds < 1) {
    return '<1s';
  }
  return seconds < SECONDS_PER_MINUTE
    ? `${String(seconds)}s`
    : `${String(Math.floor(seconds / SECONDS_PER_MINUTE))}m${String(seconds % SECONDS_PER_MINUTE).padStart(2, '0')}s`;
}

function countAnalyzers(count: unknown): string {
  return `${String(count)} ${count === 1 ? 'analyzer' : 'analyzers'}`;
}

export function startLine({
  label,
  total,
}: {
  readonly label: string;
  readonly total: number;
}): string {
  return `nitpicker: ${label}: running ${countAnalyzers(total)}\n`;
}

export function cachedLine({
  label,
  count,
  directory,
}: {
  readonly label: string;
  readonly count: unknown;
  readonly directory: unknown;
}): string {
  const location = directory === undefined ? 'remote cache' : textOf(shownPath(directory));
  return `nitpicker: ${label} ${countAnalyzers(count)} cached (${location}; use --no-cache to rerun)\n`;
}

const QUIET_BELOW_MS = 10_000;

function isQuick({ status, elapsedMs }: SettledTask): boolean {
  return status === 'done' && elapsedMs !== undefined && elapsedMs < QUIET_BELOW_MS;
}

export function createProgressReporter({
  write,
  label,
  total,
}: {
  readonly write: (line: string) => unknown;
  readonly label: unknown;
  readonly total: unknown;
}): (task: SettledTask) => void {
  let settled = 0;
  return function reportSettled(task: SettledTask): void {
    settled += 1;
    if (isQuick(task)) {
      return;
    }
    const { name, status, elapsedMs, because } = task;
    const outcome =
      status === 'skipped'
        ? `skipped (${textOf(because)} failed)`
        : `${status} (${formatDuration(elapsedMs ?? Number.NaN)})`;
    write(
      `nitpicker: ${textOf(label)} ${name} ${outcome}, ${String(settled)} of ${String(total)}\n`,
    );
  };
}

export function writeToDescriptor(
  line: string,
  descriptor: number = PROGRESS_FD,
): { readonly written: boolean; readonly error?: unknown } {
  try {
    writeSync(descriptor, line);
    return { written: true };
  } catch (error) {
    return { written: false, error };
  }
}

export function reportingProgress(runTasks: RunTasks, stream: ProgressStream): RunTasks {
  return function runTasksWithProgress(tasks, headPolicyFile, { snapshot }) {
    stream.write(startLine({ label: snapshot, total: tasks.length }));
    return runTasks(tasks, headPolicyFile, { snapshot, progress: { stream, label: snapshot } });
  };
}
