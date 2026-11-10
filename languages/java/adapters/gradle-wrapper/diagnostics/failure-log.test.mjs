import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { gradleLog, withGradleLog } from './failure-log.mjs';

vi.mock('node:fs', () => ({ mkdirSync: vi.fn(), writeFileSync: vi.fn() }));

const LOG = { file: '/out/logs/java-head-gradle.log', label: 'out/logs/java-head-gradle.log' };

describe('withGradleLog', () => {
  it('saves the output under the report folder and names it after the message', () => {
    const error = withGradleLog(new Error('Gradle failed'), { stdout: 'out', stderr: 'err' }, LOG);

    expect(error.message).toBe('Gradle failed\nFull Gradle log: out/logs/java-head-gradle.log');
    expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith('/out/logs', { recursive: true });
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
      LOG.file,
      '=== stdout ===\nout\n=== stderr ===\nerr',
      { mode: 0o600 },
    );
  });

  it('leaves the error alone and writes nothing without a report folder', () => {
    const buildError = new Error('Gradle failed');
    vi.mocked(writeFileSync).mockClear();

    expect(withGradleLog(buildError, { stdout: '', stderr: '' }, gradleLog({}))).toBe(buildError);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });

  it('reports the storage problem alongside the original build error', () => {
    const buildError = new Error('Gradle test task failed');
    const storageError = new Error('disk is full');
    vi.mocked(writeFileSync).mockImplementation(() => {
      throw storageError;
    });

    const error = withGradleLog(buildError, { stdout: '', stderr: 'test failed' }, LOG);

    expect(error.message).toBe(
      'Gradle test task failed\nCould not save the Gradle log: disk is full',
    );
    expect(error.cause).toBe(storageError);
    expect(error.errors).toEqual([buildError, storageError]);
  });
});

describe('gradleLog', () => {
  it('names the log after the preset and the snapshot, shown by its label', () => {
    expect(
      gradleLog({
        logRoot: '/p/reports/logs',
        logLabel: 'reports/logs',
        preset: 'kotlin',
        snapshot: 'base',
      }),
    ).toEqual({
      file: '/p/reports/logs/kotlin-base-gradle.log',
      label: 'reports/logs/kotlin-base-gradle.log',
    });
  });
});
