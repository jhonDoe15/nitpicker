import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mts';

const hooks = vi.hoisted(() => ({ beforeRename: () => {}, beforeLockCreate: () => {} }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    renameSync(from: string, to: string) {
      if (from.endsWith('.lock')) {
        hooks.beforeRename();
      }
      actual.renameSync(from, to);
    },
    writeFileSync(file: string, data: string, options?: { flag?: string }) {
      if (file.endsWith('.lock') && options?.flag === 'wx') {
        hooks.beforeLockCreate();
      }
      actual.writeFileSync(file, data, options);
    },
  };
});

const { buildOnce } = await import('./build-once.mts');

const ABSENT_PROCESS_ID = 2_147_483_646;
const { temporaryRoot } = useGitFixtures();

afterEach(() => {
  hooks.beforeRename = () => {};
  hooks.beforeLockCreate = () => {};
});

function sharedDirectory() {
  return temporaryRoot('nitpicker-build-once-races-');
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
