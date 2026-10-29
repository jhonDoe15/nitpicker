import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acquireRunLock, describeRunInProgress, isProcessAlive, withRunLock } from './run-lock.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function lockPathInTemporaryDirectory() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-lock-'));
  temporaryRoots.push(root);
  return path.join(root, 'run.lock');
}

describe('run lock', () => {
  it('creates the lock with the pid and removes it on release', () => {
    const lockPath = lockPathInTemporaryDirectory();

    const lock = acquireRunLock(lockPath, { pid: 4242, isAlive: () => false });

    expect(lock.acquired).toBe(true);
    expect(readFileSync(lockPath, 'utf8')).toBe('4242\n');
    lock.release();
    expect(existsSync(lockPath)).toBe(false);
  });

  it('refuses while the process that holds the lock is alive', () => {
    const lockPath = lockPathInTemporaryDirectory();
    writeFileSync(lockPath, '1234\n');

    const lock = acquireRunLock(lockPath, { pid: 4242, isAlive: (pid) => pid === 1234 });

    expect(lock).toEqual({ acquired: false, holder: 1234 });
    expect(readFileSync(lockPath, 'utf8')).toBe('1234\n');
    expect(describeRunInProgress(lock.holder)).toBe(
      `nitpicker: another run is in progress in this project (pid 1234); wait for it to finish.\n`,
    );
  });

  it('takes over a lock whose process is gone', () => {
    const lockPath = lockPathInTemporaryDirectory();
    writeFileSync(lockPath, '1234\n');

    const lock = acquireRunLock(lockPath, { pid: 4242, isAlive: () => false });

    expect(lock.acquired).toBe(true);
    expect(readFileSync(lockPath, 'utf8')).toBe('4242\n');
    lock.release();
  });

  it('takes over a lock without a readable pid and a lock left by this very pid', () => {
    const lockPath = lockPathInTemporaryDirectory();
    writeFileSync(lockPath, 'garbage');
    const first = acquireRunLock(lockPath, { pid: 4242, isAlive: () => true });
    expect(first.acquired).toBe(true);

    const second = acquireRunLock(lockPath, { pid: 4242, isAlive: () => true });

    expect(second.acquired).toBe(true);
    second.release();
    expect(existsSync(lockPath)).toBe(false);
  });

  it('leaves a lock that another run took over alone on release', () => {
    const lockPath = lockPathInTemporaryDirectory();
    const lock = acquireRunLock(lockPath, { pid: 4242, isAlive: () => false });
    writeFileSync(lockPath, '9999\n');

    lock.release();

    expect(readFileSync(lockPath, 'utf8')).toBe('9999\n');
  });

  it('removes the lock after the operation, whether it returns or throws', () => {
    const lockPath = lockPathInTemporaryDirectory();
    const lockRoot = path.dirname(lockPath);
    const stderr = { write: () => undefined };
    const seen = [];

    const exitCode = withRunLock({ lockPath, projectRoot: lockRoot, stderr }, () => {
      seen.push(existsSync(lockPath));
      return 1;
    });
    expect(() =>
      withRunLock({ lockPath, projectRoot: lockRoot, stderr }, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');

    expect(exitCode).toBe(1);
    expect(seen).toEqual([true]);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('checks liveness with a signal: this process and its parent are alive, an unused pid is not', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(process.ppid)).toBe(true);
    expect(isProcessAlive(2_147_483_646)).toBe(false);
  });

  it('refuses while the parent process holds the lock, using the default liveness check', () => {
    const lockPath = lockPathInTemporaryDirectory();
    writeFileSync(lockPath, `${String(process.ppid)}\n`);

    expect(acquireRunLock(lockPath)).toEqual({ acquired: false, holder: process.ppid });
  });

  it('takes over the lock of a pid that is gone, using the default liveness check', () => {
    const lockPath = lockPathInTemporaryDirectory();
    writeFileSync(lockPath, '2147483646\n');

    const lock = acquireRunLock(lockPath);

    expect(lock.acquired).toBe(true);
    lock.release();
  });

  it('removes the lock from the exit hook it registers, and unregisters the hook on release', () => {
    const lockPath = lockPathInTemporaryDirectory();
    const before = new Set(process.listeners('exit'));

    const lock = acquireRunLock(lockPath);
    const [exitHook] = process.listeners('exit').filter((listener) => !before.has(listener));
    exitHook();

    expect(existsSync(lockPath)).toBe(false);
    expect(process.listeners('exit').filter((listener) => !before.has(listener))).toEqual([]);
    lock.release();
  });
});
