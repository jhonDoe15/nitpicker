import { randomBytes } from 'node:crypto';
import { linkSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fieldOf } from '../../shared/values/readers.mts';

export type FileLock =
  | { readonly acquired: true; readonly release: () => void }
  | { readonly acquired: false; readonly holder: number };

type LockOwner = {
  readonly pid?: number;
  readonly isAlive?: (pid: number) => boolean;
};

const LOCK_ATTEMPTS = 5;
const READ_ATTEMPTS = 4;
const INT32_BYTES = 4;
const SUFFIX_BYTES = 4;
const PARTIAL_READ_WAIT_MS = 20;
const WAIT_STEP_MS = 100;

function attempts(count: number): readonly number[] {
  return Array.from({ length: count }, (_, attempt) => attempt);
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return fieldOf(error, 'code') === 'EPERM';
  }
}

function pause(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(INT32_BYTES)), 0, 0, milliseconds);
}

function parsePid(text: string): number | undefined {
  const pid = Number.parseInt(text, 10);
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

function readHolderPid(lockPath: string): number | undefined {
  for (const attempt of attempts(READ_ATTEMPTS)) {
    if (attempt > 0) {
      pause(PARTIAL_READ_WAIT_MS);
    }
    const pid = parsePid(readFileSync(lockPath, 'utf8'));
    if (pid !== undefined) {
      return pid;
    }
  }
  return undefined;
}

function siblingFile(lockPath: string, suffix: string): string {
  const directory = path.dirname(path.resolve(lockPath));
  const full = path.resolve(directory, `${path.basename(lockPath)}.${suffix}`);
  if (path.dirname(full) !== directory) {
    throw new Error(`${suffix} does not name a file next to ${lockPath}`);
  }
  return full;
}

function createLockFile(lockPath: string, pid: number): boolean {
  const written = siblingFile(
    lockPath,
    `${String(pid)}-${randomBytes(SUFFIX_BYTES).toString('hex')}`,
  );
  writeFileSync(written, `${String(pid)}\n`, { flag: 'wx' });
  try {
    linkSync(written, lockPath);
    return true;
  } catch (error) {
    if (fieldOf(error, 'code') === 'EEXIST') {
      return false;
    }
    throw error;
  } finally {
    rmSync(written, { force: true });
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

function removeStaleLock(lockPath: string, owner: Required<LockOwner>): void {
  const guardPath = siblingFile(lockPath, 'steal');
  if (!createLockFile(guardPath, owner.pid)) {
    if (readLiveHolder(guardPath, owner) === undefined) {
      rmSync(guardPath, { force: true });
    } else {
      pause(PARTIAL_READ_WAIT_MS);
    }
    return;
  }
  try {
    if (readLiveHolder(lockPath, owner) === undefined) {
      rmSync(lockPath, { force: true });
    }
  } finally {
    rmSync(guardPath, { force: true });
  }
}

export function acquireFileLock(
  lockPath: string,
  { pid = process.pid, isAlive = isProcessAlive }: LockOwner = {},
): FileLock {
  for (const attempt of attempts(LOCK_ATTEMPTS)) {
    if (attempt > 0) {
      removeStaleLock(lockPath, { pid, isAlive });
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

export function withWaitedLock<Result>(
  lockPath: string,
  { timeoutMs, describe }: { readonly timeoutMs: number; readonly describe: string },
  operation: () => Result,
): Result {
  const deadline = Date.now() + timeoutMs;
  let holder = 0;
  for (const attempt of attempts(Math.ceil(timeoutMs / WAIT_STEP_MS) + 1)) {
    if (attempt > 0) {
      pause(WAIT_STEP_MS);
    }
    const lock = acquireFileLock(lockPath);
    if (lock.acquired) {
      try {
        return operation();
      } finally {
        lock.release();
      }
    }
    holder = lock.holder;
    if (Date.now() > deadline) {
      break;
    }
  }
  throw new Error(`${describe}: pid ${String(holder)} still holds ${lockPath}`);
}
