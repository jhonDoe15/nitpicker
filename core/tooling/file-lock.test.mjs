import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { withWaitedLock } from './file-lock.mts';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function lockPath() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-lock-'));
  roots.push(root);
  return path.join(root, 'dependencies.lock');
}

const WAIT = { timeoutMs: 150, describe: 'the base dependencies did not become ready' };

describe('a lock other processes wait for', () => {
  it('runs the operation while it holds the lock and releases it afterwards', () => {
    const file = lockPath();

    const held = withWaitedLock(file, WAIT, () => existsSync(file));

    expect(held).toBe(true);
    expect(existsSync(file)).toBe(false);
  });
  it('waits for a live holder and names it when the wait runs out', () => {
    const file = lockPath();
    writeFileSync(file, `${String(process.ppid)}\n`);

    expect(() => withWaitedLock(file, WAIT, () => 'ran')).toThrow(
      `the base dependencies did not become ready: pid ${String(process.ppid)} still holds ${file}`,
    );
  });
  it('takes over the lock of a process that is gone', () => {
    const file = lockPath();
    writeFileSync(file, '999999999\n');

    expect(withWaitedLock(file, WAIT, () => 'ran')).toBe('ran');
  });
});
