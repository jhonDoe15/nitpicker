import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fieldOf } from '../../shared/values/readers.mts';

export type FileLock =
  | { readonly acquired: true; readonly release: () => void }
  | { readonly acquired: false; readonly holder: number };

type LockOwner = {
  readonly pid?: number;
  readonly isAlive?: (pid: number) => boolean;
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

function heldLock(lockPath: string, pid: number): FileLock {
  function release(): void {
    process.off('exit', release);
    releaseLock(lockPath, pid);
  }
  process.once('exit', release);
  return { acquired: true, release };
}

export function acquireFileLock(
  lockPath: string,
  { pid = process.pid, isAlive = isProcessAlive }: LockOwner = {},
): FileLock {
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
  throw new Error(`Could not take the lock ${lockPath}`);
}

const WAIT_STEP_MS = 100;

function pause(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

export function withWaitedLock<Result>(
  lockPath: string,
  { timeoutMs, describe }: { readonly timeoutMs: number; readonly describe: string },
  operation: () => Result,
): Result {
  const deadline = Date.now() + timeoutMs;
  for (let lock = acquireFileLock(lockPath); ; lock = acquireFileLock(lockPath)) {
    if (lock.acquired) {
      try {
        return operation();
      } finally {
        lock.release();
      }
    }
    if (Date.now() > deadline) {
      throw new Error(`${describe}: pid ${String(lock.holder)} still holds ${lockPath}`);
    }
    pause(WAIT_STEP_MS);
  }
}
