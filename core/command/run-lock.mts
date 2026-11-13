import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runGit } from '../diff/git/repository/command.mjs';
import type { TextOutput } from '../cli-context.mts';
import { fieldOf } from '../../shared/values/readers.mts';

type RunLock =
  | { readonly acquired: true; readonly release: () => void }
  | { readonly acquired: false; readonly holder: number };

type LockOwner = {
  readonly pid?: number;
  readonly isAlive?: (pid: number) => boolean;
};

type LockedRun = {
  readonly projectRoot: string;
  readonly stderr: TextOutput;
  readonly lockPath?: string;
};

const ATTEMPTS = Array.from({ length: 5 }, (_, attempt) => attempt);
const PARTIAL_READ_WAIT_MS = 20;

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return fieldOf(error, 'code') === 'EPERM';
  }
}

export function resolveRunLockPath(projectRoot: string): string {
  const name = `nitpicker-run-${createHash('sha256').update(projectRoot).digest('hex').slice(0, 12)}.lock`;
  return path.resolve(projectRoot, runGit(projectRoot, ['rev-parse', '--git-path', name]).trim());
}

function parsePid(text: string): number | undefined {
  const pid = Number.parseInt(text, 10);
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

function readHolderPid(lockPath: string): number | undefined {
  for (const attempt of ATTEMPTS.slice(0, 4)) {
    if (attempt > 0) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, PARTIAL_READ_WAIT_MS);
    }
    const pid = parsePid(readFileSync(lockPath, 'utf8'));
    if (pid !== undefined) {
      return pid;
    }
  }
  return undefined;
}

function createLockFile(lockPath: string, pid: number): boolean {
  try {
    writeFileSync(lockPath, `${String(pid)}\n`, { flag: 'wx' });
    return true;
  } catch (error) {
    if (fieldOf(error, 'code') === 'EEXIST') {
      return false;
    }
    throw error;
  }
}

function readLiveHolder(
  lockPath: string,
  { pid, isAlive }: Required<LockOwner>,
): number | undefined {
  try {
    const holder = readHolderPid(lockPath);
    return holder !== undefined && holder !== pid && isAlive(holder) ? holder : undefined;
  } catch (error) {
    if (fieldOf(error, 'code') === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function releaseLock(
  lockPath: string,
  pid: number,
): { readonly released: boolean; readonly error?: unknown } {
  try {
    if (parsePid(readFileSync(lockPath, 'utf8')) === pid) {
      rmSync(lockPath, { force: true });
    }
  } catch (error) {
    return { released: false, error };
  }
  return { released: true };
}

function heldLock(lockPath: string, pid: number): RunLock {
  function release(): void {
    process.off('exit', release);
    releaseLock(lockPath, pid);
  }
  process.once('exit', release);
  return { acquired: true, release };
}

export function acquireRunLock(
  lockPath: string,
  { pid = process.pid, isAlive = isProcessAlive }: LockOwner = {},
): RunLock {
  for (const attempt of ATTEMPTS) {
    if (attempt > 0) {
      rmSync(lockPath, { force: true });
    }
    if (createLockFile(lockPath, pid)) {
      return heldLock(lockPath, pid);
    }
    const holder = readLiveHolder(lockPath, { pid, isAlive });
    if (holder !== undefined) {
      return { acquired: false, holder };
    }
  }
  throw new Error(`Could not take the run lock ${lockPath}`);
}

export function describeRunInProgress(holder: number): string {
  const message = `another run is in progress in this project (pid ${String(holder)}); wait for it to finish.`;
  return `nitpicker: ${message}\n`;
}

export function withRunLock<Result>(
  { projectRoot, stderr, lockPath = resolveRunLockPath(projectRoot) }: LockedRun,
  operation: () => Result,
): Result | number {
  const lock = acquireRunLock(lockPath);
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
