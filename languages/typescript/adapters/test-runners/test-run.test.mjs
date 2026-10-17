import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { testTimeoutMs, uncoveredRun, workerCount } from './test-run.mjs';

let directory;

function stubThresholds(thresholds) {
  directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-test-run-'));
  writeFileSync(path.join(directory, 'policy.json'), JSON.stringify({ thresholds }));
  vi.stubEnv('NITPICKER_POLICY', path.join(directory, 'policy.json'));
}

afterEach(() => {
  vi.unstubAllEnvs();
  if (directory !== undefined) {
    rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  }
});

describe('the limits of a test run', () => {
  it('lets a test run ten seconds past the largest slow test budget, so the gate can report it', () => {
    expect(testTimeoutMs()).toBe(40_000);
    stubThresholds({ unitTestSeconds: 2, integrationTestSeconds: 90.5 });
    expect(testTimeoutMs()).toBe(100_500);
  });

  it('runs the tests that time a rerun one at a time', () => {
    expect(workerCount({})).toBe(4);
    expect(workerCount({ rerun: { files: [], namePattern: '^$' } })).toBe(1);
  });

  it('starts a rerun without coverage, keeping the runner environment', async () => {
    const run = uncoveredRun({ environment: { A: '1' } });
    expect({ nodeArguments: run.nodeArguments, environment: run.environment }).toEqual({
      nodeArguments: [],
      environment: { A: '1' },
    });
    expect(await run.write()).toBeUndefined();
  });
});
