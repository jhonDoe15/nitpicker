import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  BUSY,
  READY,
  SOCKET,
  forgetHost,
  hostFile,
  hostPid,
  isAlive,
  isHostProcess,
  isLeased,
  stopHost,
  takeLease,
} from './host-files.mts';
import { HOST_MAIN_CLASS } from './host-config.mts';

const DEAD_PID = 999_999_999;
const WAIT_MS = 10_000;
const roots: string[] = [];
const children: ChildProcess[] = [];

afterAll(() => {
  for (const child of children.splice(0)) {
    child.kill('SIGKILL');
  }
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function directory(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-hostfiles-'));
  roots.push(root);
  return root;
}

function sleeper(label = HOST_MAIN_CLASS): number {
  const child = spawn('sh', ['-c', 'sleep 30', label], { stdio: 'ignore' });
  children.push(child);
  return child.pid ?? 0;
}

describe('host files', () => {
  it('reads the process id a host wrote to its ready file', () => {
    const dir = directory();
    writeFileSync(hostFile(dir, 'k', READY), '4242');

    expect(hostPid(dir, 'k')).toBe(4242);
    expect(hostPid(dir, 'other')).toBeUndefined();
  });

  it('tells a running process from a missing one', () => {
    expect(isAlive(process.pid)).toBe(true);
    expect(isAlive(undefined)).toBe(false);
  });

  it('forgets the socket, ready and busy files of a host', () => {
    const dir = directory();
    for (const suffix of [SOCKET, READY, BUSY]) writeFileSync(hostFile(dir, 'k', suffix), '1');
    forgetHost(dir, 'k');

    expect([SOCKET, READY, BUSY].some((suffix) => existsSync(hostFile(dir, 'k', suffix)))).toBe(
      false,
    );
  });

  it('kills the process of a host and forgets its files', async () => {
    const dir = directory();
    const pid = sleeper();
    writeFileSync(hostFile(dir, 'k', READY), String(pid));
    stopHost(dir, 'k');
    await vi.waitFor(
      () => {
        expect(isAlive(pid)).toBe(false);
      },
      { timeout: WAIT_MS },
    );

    expect(isAlive(pid)).toBe(false);
    expect(existsSync(hostFile(dir, 'k', READY))).toBe(false);
  });

  it('does not kill a process that is not a host, even when the ready file names it', () => {
    const dir = directory();
    const pid = sleeper('something.else');
    writeFileSync(hostFile(dir, 'k', READY), String(pid));
    stopHost(dir, 'k');

    expect(isAlive(pid)).toBe(true);
    expect(existsSync(hostFile(dir, 'k', READY))).toBe(false);
  });

  it('recognises a host by its command line', async () => {
    const pid = sleeper();
    await vi.waitFor(
      () => {
        expect(isHostProcess(pid)).toBe(true);
      },
      { timeout: WAIT_MS },
    );

    expect(isHostProcess(pid)).toBe(true);
    expect(isHostProcess(process.pid)).toBe(false);
    expect(isHostProcess(undefined)).toBe(false);
  });

  it('keeps a lease for a live process and drops one left by a dead process', () => {
    const dir = directory();
    const lease = takeLease(dir, 'k');
    writeFileSync(path.join(dir, `k.lease-${String(DEAD_PID)}`), '');

    expect(isLeased(dir, 'k')).toBe(true);
    expect(existsSync(path.join(dir, `k.lease-${String(DEAD_PID)}`))).toBe(false);
    rmSync(lease);

    expect(isLeased(dir, 'k')).toBe(false);
  });
});
