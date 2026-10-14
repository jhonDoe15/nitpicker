import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ beforeRename: () => {}, beforeLockCreate: () => {} }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    renameSync(from, to) {
      if (String(from).endsWith('.lock')) {
        hooks.beforeRename();
      }
      return actual.renameSync(from, to);
    },
    writeFileSync(file, data, options) {
      if (String(file).endsWith('.lock') && options?.flag === 'wx') {
        hooks.beforeLockCreate();
      }
      return actual.writeFileSync(file, data, options);
    },
  };
});

const { buildOnce } = await import('./build-once.mjs');

const ABSENT_PROCESS_ID = 2_147_483_646;
const temporaryRoots = [];

afterEach(() => {
  hooks.beforeRename = () => {};
  hooks.beforeLockCreate = () => {};
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function sharedDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-build-once-races-'));
  temporaryRoots.push(directory);
  return directory;
}

describe('buildOnce races', () => {
  it('keeps a live lock that replaced the stale one while this caller was deciding', () => {
    const directory = sharedDirectory();
    const lock = path.join(directory, 'key.lock');
    writeFileSync(lock, String(ABSENT_PROCESS_ID));
    hooks.beforeRename = () => {
      hooks.beforeRename = () => {};
      writeFileSync(lock, String(process.pid));
    };
    const build = vi.fn(() => 'own');

    expect(() => buildOnce('key', build, { directory, pause: vi.fn() })).toThrow(
      'Timed out waiting for the shared build',
    );

    expect(build).not.toHaveBeenCalled();
    expect(readdirSync(directory)).toEqual(['key.lock']);
    expect(readFileSync(lock, 'utf8')).toBe(String(process.pid));
  });

  it('returns the result another builder finished before this caller got the lock', () => {
    const directory = sharedDirectory();
    hooks.beforeLockCreate = () => {
      hooks.beforeLockCreate = () => {};
      writeFileSync(path.join(directory, 'key.result'), 'from the other builder');
    };
    const build = vi.fn(() => 'own');

    expect(buildOnce('key', build, { directory })).toBe('from the other builder');

    expect(build).not.toHaveBeenCalled();
    expect(readdirSync(directory)).toEqual(['key.result']);
  });
});
