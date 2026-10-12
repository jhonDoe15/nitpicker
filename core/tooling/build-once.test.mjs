import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOnce,
  SHARED_BUILD_DIRECTORY_ENVIRONMENT,
  withSharedBuildDirectory,
} from './build-once.mjs';

const ABSENT_PROCESS_ID = 2_147_483_646;
const temporaryRoots = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function sharedDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-build-once-'));
  temporaryRoots.push(directory);
  return directory;
}

function countingBuild(text) {
  const build = vi.fn(() => text);
  return build;
}

describe('buildOnce', () => {
  it('builds on every call when no shared directory is configured', () => {
    const build = countingBuild('graph');

    expect(buildOnce('key', build, { directory: undefined })).toBe('graph');
    expect(buildOnce('key', build, { directory: '' })).toBe('graph');

    expect(build).toHaveBeenCalledTimes(2);
  });

  it('builds on the first call and reuses the result afterwards', () => {
    const directory = sharedDirectory();
    const build = countingBuild('graph');

    expect(buildOnce('key', build, { directory })).toBe('graph');
    expect(buildOnce('key', build, { directory })).toBe('graph');

    expect(build).toHaveBeenCalledTimes(1);
    expect(existsSync(path.join(directory, 'key.lock'))).toBe(false);
  });

  it('reads the directory from the environment', () => {
    const directory = sharedDirectory();
    vi.stubEnv(SHARED_BUILD_DIRECTORY_ENVIRONMENT, directory);
    const build = countingBuild('graph');

    buildOnce('key', build);
    buildOnce('key', build);

    expect(build).toHaveBeenCalledTimes(1);
    expect(readdirSync(directory)).toEqual(['key.result']);
  });

  it('keeps results for different keys apart', () => {
    const directory = sharedDirectory();

    expect(buildOnce('first', () => 'one', { directory })).toBe('one');
    expect(buildOnce('second', () => 'two', { directory })).toBe('two');
  });

  it('waits for a running builder and reuses its result', () => {
    const directory = sharedDirectory();
    writeFileSync(path.join(directory, 'key.lock'), String(process.pid));
    const build = countingBuild('own');
    const pause = vi.fn(() => {
      writeFileSync(path.join(directory, 'key.result'), 'from the other builder');
      rmSync(path.join(directory, 'key.lock'));
    });

    expect(buildOnce('key', build, { directory, pause })).toBe('from the other builder');

    expect(pause).toHaveBeenCalledTimes(1);
    expect(build).not.toHaveBeenCalled();
  });

  it('keeps waiting while the lock owner is alive and has produced nothing', () => {
    const directory = sharedDirectory();
    writeFileSync(path.join(directory, 'key.lock'), String(process.pid));
    const pause = vi.fn();
    pause
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        writeFileSync(path.join(directory, 'key.result'), 'late');
      });

    expect(buildOnce('key', countingBuild('own'), { directory, pause })).toBe('late');

    expect(pause).toHaveBeenCalledTimes(2);
  });

  it('gives up when a live builder never finishes', () => {
    const directory = sharedDirectory();
    writeFileSync(path.join(directory, 'key.lock'), String(process.pid));
    const build = countingBuild('own');

    expect(() => buildOnce('key', build, { directory, pause: vi.fn() })).toThrow(
      'Timed out waiting for the shared build',
    );

    expect(build).not.toHaveBeenCalled();
  });

  it('takes over a lock whose owner has died', () => {
    const directory = sharedDirectory();
    writeFileSync(path.join(directory, 'key.lock'), String(ABSENT_PROCESS_ID));
    const build = countingBuild('own');

    expect(buildOnce('key', build, { directory, pause: vi.fn() })).toBe('own');

    expect(build).toHaveBeenCalledTimes(1);
  });

  it('shares a failed build instead of building again', () => {
    const directory = sharedDirectory();
    const failing = vi.fn(() => {
      throw new Error('cruise failed');
    });
    const other = countingBuild('own');

    expect(() => buildOnce('key', failing, { directory })).toThrow('cruise failed');
    expect(() => buildOnce('key', other, { directory })).toThrow('cruise failed');

    expect(failing).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    expect(existsSync(path.join(directory, 'key.lock'))).toBe(false);
  });
});

describe('withSharedBuildDirectory', () => {
  it('hands the operation a directory that exists only while it runs', () => {
    let directory;

    const result = withSharedBuildDirectory((environment) => {
      directory = environment[SHARED_BUILD_DIRECTORY_ENVIRONMENT];
      expect(existsSync(directory)).toBe(true);
      return 'done';
    });

    expect(result).toBe('done');
    expect(existsSync(directory)).toBe(false);
  });

  it('removes the directory when the operation throws', () => {
    let directory;

    expect(() =>
      withSharedBuildDirectory((environment) => {
        directory = environment[SHARED_BUILD_DIRECTORY_ENVIRONMENT];
        writeFileSync(path.join(directory, 'key.result'), 'graph');
        throw new Error('scheduler crashed');
      }),
    ).toThrow('scheduler crashed');

    expect(existsSync(directory)).toBe(false);
  });
});
