import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { withReportBase } from './report-base.mts';

function stillBusy(): void {
  throw Object.assign(new Error('ENOTEMPTY: directory not empty'), { code: 'ENOTEMPTY' });
}

describe('withReportBase', () => {
  it('keeps the build failure when the folder cannot be removed because a tool still writes to it', () => {
    expect(() =>
      withReportBase(
        undefined,
        () => {
          throw new Error('Gradle build daemon disappeared unexpectedly');
        },
        stillBusy,
      ),
    ).toThrow('Gradle build daemon disappeared unexpectedly');
  });

  it('returns the result when the folder cannot be removed', () => {
    expect(withReportBase(undefined, () => 'findings', stillBusy)).toBe('findings');
  });

  it('removes the temporary folder it made and leaves a given folder alone', () => {
    const given = mkdtempSync(path.join(tmpdir(), 'given-'));
    let made = '';
    withReportBase(undefined, (base) => {
      made = base;
    });
    withReportBase(given, () => undefined);

    expect(existsSync(made)).toBe(false);
    expect(existsSync(given)).toBe(true);
    rmSync(given, { recursive: true });
  });

  it('hides the temporary folder name in the error message', () => {
    expect(() =>
      withReportBase(undefined, (base) => {
        throw new Error(`cannot read ${base}/module-a`);
      }),
    ).toThrow('cannot read <report directory>/module-a');
  });
});
