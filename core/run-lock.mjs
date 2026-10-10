import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runGit } from './diff/git.mjs';

const ATTEMPTS = Array.from({ length: 5 }, (_, attempt) => attempt);
const PARTIAL_READ_WAIT_MS = 20;

export function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export function resolveRunLockPath(projectRoot) {
  const name = `nitpicker-run-${createHash('sha256').update(projectRoot).digest('hex').slice(0, 12)}.lock`;
  return path.resolve(projectRoot, runGit(projectRoot, ['rev-parse', '--git-path', name]).trim());
}

function parsePid(text) {
  const pid = Number.parseInt(text, 10);
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

function readHolderPid(lockPath) {
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

function createLockFile(lockPath, pid) {
  try {
    writeFileSync(lockPath, `${String(pid)}\n`, { flag: 'wx' });
    return true;
  } catch (error) {
    if (error?.code === 'EEXIST') {
      return false;
    }
    throw error;
  }
}

function readLiveHolder(lockPath, { pid, isAlive }) {
  try {
    const holder = readHolderPid(lockPath);
    return holder !== undefined && holder !== pid && isAlive(holder) ? holder : undefined;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function releaseLock(lockPath, pid) {
  try {
    if (parsePid(readFileSync(lockPath, 'utf8')) === pid) {
      rmSync(lockPath, { force: true });
    }
  } catch (error) {
    return { released: false, error };
  }
  return { released: true };
}

function heldLock(lockPath, pid) {
  function release() {
    process.off('exit', release);
    releaseLock(lockPath, pid);
  }
  process.once('exit', release);
  return { acquired: true, release };
}

export function acquireRunLock(lockPath, { pid = process.pid, isAlive = isProcessAlive } = {}) {
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

export function describeRunInProgress(holder) {
  return `nitpicker: another run is in progress in this project (pid ${String(holder)}); wait for it to finish.\n`;
}

export function withRunLock(
  { projectRoot, stderr, lockPath = resolveRunLockPath(projectRoot) },
  operation,
) {
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
