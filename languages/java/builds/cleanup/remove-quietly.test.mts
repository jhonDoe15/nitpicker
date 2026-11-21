import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fsMock = vi.hoisted(() => ({
  rmSync: vi.fn<typeof import('node:fs').rmSync>(),
  actualRmSync: undefined as typeof import('node:fs').rmSync | undefined,
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  fsMock.actualRmSync = actual.rmSync;
  fsMock.rmSync.mockImplementation(actual.rmSync);
  return { ...actual, rmSync: fsMock.rmSync };
});

import { removeQuietly } from './remove-quietly.mts';

const roots: string[] = [];

afterEach(() => {
  fsMock.rmSync.mockReset();
  if (fsMock.actualRmSync !== undefined) {
    fsMock.rmSync.mockImplementation(fsMock.actualRmSync);
  }
  for (const root of roots.splice(0)) {
    fsMock.actualRmSync?.(root, { recursive: true, force: true });
  }
});

describe('removeQuietly', () => {
  it('removes a directory tree with retries and returns true without warning', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-remove-quietly-'));
    roots.push(directory);
    mkdirSync(path.join(directory, 'nested'), { recursive: true });
    writeFileSync(path.join(directory, 'nested', 'file.txt'), 'content');
    const warn = { write: vi.fn() };

    expect(removeQuietly(directory, warn)).toBe(true);
    expect(existsSync(directory)).toBe(false);
    expect(warn.write).not.toHaveBeenCalled();
    expect(fsMock.rmSync).toHaveBeenCalledWith(directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  });

  it('succeeds without throwing when the target does not exist', () => {
    const missing = path.join(tmpdir(), 'nitpicker-missing-remove-quietly-path');

    expect(removeQuietly(missing)).toBe(true);
  });

  it('swallows ENOTEMPTY and reports a warning instead of throwing', () => {
    const error = Object.assign(new Error('ENOTEMPTY: directory not empty, rmdir'), {
      code: 'ENOTEMPTY',
    });
    fsMock.rmSync.mockImplementation(() => {
      throw error;
    });
    const warnings: string[] = [];

    expect(removeQuietly('/tmp/report-dir', { write: (text) => warnings.push(text) })).toBe(false);
    expect(warnings).toEqual([
      'nitpicker: could not remove temporary path /tmp/report-dir: ENOTEMPTY: directory not empty, rmdir\n',
    ]);
  });

  it('never throws when warn is omitted or when warn.write fails', () => {
    fsMock.rmSync.mockImplementation(() => {
      throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    });

    expect(removeQuietly('/tmp/protected')).toBe(false);
    expect(
      removeQuietly('/tmp/protected', {
        write: () => {
          throw new Error('broken pipe');
        },
      }),
    ).toBe(false);
  });
});
