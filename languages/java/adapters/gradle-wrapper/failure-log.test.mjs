import { mkdtempSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { withGradleLog } from './failure-log.mjs';

vi.mock('node:fs', () => ({ mkdtempSync: vi.fn(), writeFileSync: vi.fn() }));

describe('a failure to save the Gradle log', () => {
  it('reports the storage problem alongside the original build error', () => {
    const buildError = new Error('Gradle test task failed');
    const storageError = new Error('disk is full');
    vi.mocked(mkdtempSync).mockImplementation(() => {
      throw storageError;
    });

    const error = withGradleLog(buildError, { stdout: '', stderr: 'test failed' });

    expect(error.message).toBe(
      'Gradle test task failed\nCould not save the Gradle log: disk is full',
    );
    expect(error.cause).toBe(storageError);
    expect(error.errors).toEqual([buildError, storageError]);
  });
});
