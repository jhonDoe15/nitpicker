import { writeSync } from 'node:fs';

const PROGRESS_FD = 3;

export function formatDuration(elapsedMs) {
  const seconds = Math.round(elapsedMs / 1000);
  if (seconds < 1) {
    return '<1s';
  }
  return seconds < 60
    ? `${String(seconds)}s`
    : `${String(Math.floor(seconds / 60))}m${String(seconds % 60).padStart(2, '0')}s`;
}

function countAnalyzers(count) {
  return `${String(count)} ${count === 1 ? 'analyzer' : 'analyzers'}`;
}

export function startLine({ label, total }) {
  return `nitpicker: ${label}: running ${countAnalyzers(total)}\n`;
}

export function cachedLine({ label, count, directory }) {
  const location = directory === undefined ? 'remote cache' : directory;
  return `nitpicker: ${label} ${countAnalyzers(count)} cached (${location}; use --no-cache to rerun)\n`;
}

const QUIET_BELOW_MS = 10_000;

function isQuick({ status, elapsedMs }) {
  return status === 'done' && elapsedMs < QUIET_BELOW_MS;
}

export function createProgressReporter({ write, label, total }) {
  let settled = 0;
  return function reportSettled({ name, status, elapsedMs, because }) {
    settled += 1;
    if (isQuick({ status, elapsedMs })) {
      return;
    }
    const outcome =
      status === 'skipped'
        ? `skipped (${because} failed)`
        : `${status} (${formatDuration(elapsedMs)})`;
    write(`nitpicker: ${label} ${name} ${outcome}, ${String(settled)} of ${String(total)}\n`);
  };
}

export function writeToDescriptor(line, descriptor = PROGRESS_FD) {
  try {
    writeSync(descriptor, line);
    return { written: true };
  } catch (error) {
    return { written: false, error };
  }
}

export function reportingProgress(runTasks, stream) {
  return function runTasksWithProgress(tasks, headPolicyFile, { snapshot }) {
    stream.write(startLine({ label: snapshot, total: tasks.length }));
    return runTasks(tasks, headPolicyFile, { snapshot, progress: { stream, label: snapshot } });
  };
}
