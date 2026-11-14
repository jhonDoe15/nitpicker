import { createHash } from 'node:crypto';
import path from 'node:path';
import { runGit } from '../diff/git/repository/command.mjs';
import type { TextOutput } from '../cli-context.mts';
import { acquireFileLock, isProcessAlive } from '../tooling/file-lock.mts';

type LockedRun = {
  readonly projectRoot: string;
  readonly stderr: TextOutput;
  readonly lockPath?: string;
  readonly projectKey?: string | undefined;
};

export function resolveRunLockPath(projectRoot: string, projectKey?: string): string {
  const identity = projectKey === undefined ? projectRoot : `${projectRoot}@${projectKey}`;
  const name = `nitpicker-run-${createHash('sha256').update(identity).digest('hex').slice(0, 12)}.lock`;
  return path.resolve(projectRoot, runGit(projectRoot, ['rev-parse', '--git-path', name]).trim());
}

export { acquireFileLock as acquireRunLock, isProcessAlive };

export function describeRunInProgress(holder: number): string {
  const message = `another run is in progress in this project (pid ${String(holder)}); wait for it to finish.`;
  return `nitpicker: ${message}\n`;
}

export function withRunLock<Result>(
  {
    projectRoot,
    stderr,
    projectKey,
    lockPath = resolveRunLockPath(projectRoot, projectKey),
  }: LockedRun,
  operation: () => Result,
): Result | number {
  const lock = acquireFileLock(lockPath);
  if (!lock.acquired) {
    stderr.write(describeRunInProgress(lock.holder));
    return 2;
  }
  try {
    return operation();
  } finally {
    lock.release();
  }
}
