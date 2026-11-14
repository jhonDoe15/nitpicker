import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { testTimeoutMs, uncoveredRun, workerCount } from './test-run.mts';
import { testOptions } from './typed/test-options.mts';

let directory: string | undefined;

function stubThresholds(thresholds: object): string {
  const created = mkdtempSync(path.join(tmpdir(), 'nitpicker-test-run-'));
  directory = created;
  writeFileSync(path.join(created, 'policy.json'), JSON.stringify({ thresholds }));
  vi.stubEnv('NITPICKER_POLICY', path.join(created, 'policy.json'));
  return created;
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
    expect(testTimeoutMs(undefined)).toBe(40_000);
    stubThresholds({ unitTestSeconds: 2, integrationTestSeconds: 90.5 });
    expect(testTimeoutMs(undefined)).toBe(100_500);
  });

  it('rejects heterogeneous deadlines on runners with one shared timer', () => {
    const policyDirectory = stubThresholds({});
    writeFileSync(
      path.join(policyDirectory, 'policy.json'),
      JSON.stringify({
        tools: {
          tests: {
            timeouts: {
              projects: {
                builds: { language: 'java', include: ['tests/build/**'], testTimeoutMs: 90_000 },
              },
            },
          },
        },
      }),
    );
    const options = testOptions({ projectRoot: policyDirectory });
    expect(() =>
      testTimeoutMs(options, ['tests/unit/a.test.mjs', 'tests/build/a.test.mjs']),
    ).toThrow('one test and hook deadline');
    expect(testTimeoutMs(options, ['tests/build/a.test.mjs'])).toBe(90_000);
  });

  it('rejects a separate hook deadline on runners with one shared timer', () => {
    const policyDirectory = stubThresholds({});
    writeFileSync(
      path.join(policyDirectory, 'policy.json'),
      JSON.stringify({
        tools: {
          tests: {
            timeouts: {
              defaults: { testTimeoutMs: 20_000, hookTimeoutMs: 30_000 },
            },
          },
        },
      }),
    );
    expect(() =>
      testTimeoutMs(testOptions({ projectRoot: policyDirectory }), ['tests/a.test.mjs']),
    ).toThrow('one test and hook deadline');
    expect(() =>
      testTimeoutMs(testOptions({ projectRoot: policyDirectory }), ['tests/a.test.mjs'], {
        hooks: false,
      }),
    ).toThrow('cannot set hook deadlines');
  });

  it('runs the tests that time a rerun one at a time', () => {
    expect(workerCount(testOptions({}))).toBe(4);
    expect(workerCount(testOptions({ rerun: { files: [], namePattern: '^$' } }))).toBe(1);
  });

  it('starts a rerun without coverage, keeping the runner environment', async () => {
    const run = uncoveredRun({ environment: { A: '1' }, arguments_: [], nodeArguments: [] });
    expect({ nodeArguments: run.nodeArguments, environment: run.environment }).toEqual({
      nodeArguments: [],
      environment: { A: '1' },
    });
    await run.write();
  });
});
