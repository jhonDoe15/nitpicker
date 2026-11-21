import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { testTimeoutMs, uncoveredRun, workerCount } from './test-run.mts';
import { testOptions } from './typed/test-options.mts';

let directory: string | undefined;

function policyEnvironment(root: string): Record<string, string> {
  return { NITPICKER_POLICY: path.join(root, 'policy.json') };
}

function stubThresholds(thresholds: object): string {
  const created = mkdtempSync(path.join(tmpdir(), 'nitpicker-test-run-'));
  directory = created;
  writeFileSync(path.join(created, 'policy.json'), JSON.stringify({ thresholds }));
  return created;
}

afterEach(() => {
  if (directory !== undefined) {
    rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  }
});

describe('the limits of a test run', () => {
  it('lets a test run ten seconds past the largest slow test budget, so the gate can report it', () => {
    expect(testTimeoutMs(testOptions({}))).toBe(40_000);
    const root = stubThresholds({ unitTestSeconds: 2, integrationTestSeconds: 90.5 });
    expect(testTimeoutMs(testOptions({ environment: policyEnvironment(root) }))).toBe(100_500);
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
    const options = testOptions({
      projectRoot: policyDirectory,
      environment: policyEnvironment(policyDirectory),
    });
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
      testTimeoutMs(
        testOptions({
          projectRoot: policyDirectory,
          environment: policyEnvironment(policyDirectory),
        }),
        ['tests/a.test.mjs'],
      ),
    ).toThrow('one test and hook deadline');
    expect(() =>
      testTimeoutMs(
        testOptions({
          projectRoot: policyDirectory,
          environment: policyEnvironment(policyDirectory),
        }),
        ['tests/a.test.mjs'],
        {
          hooks: false,
        },
      ),
    ).toThrow('cannot set hook deadlines');
  });

  it.each([
    ['an end-to-end file only', ['test/a.e2e.test.js'], 300_000],
    [
      'a mixed list of end-to-end and unit files',
      ['test/a.e2e.test.js', 'test/b.test.js'],
      300_000,
    ],
    ['a unit file only', ['test/b.test.js'], 40_000],
  ])(
    'gives a runner with one shared timer the larger deadline for %s',
    (_name, files, expected) => {
      const projectRoot = stubThresholds({});
      expect(
        testTimeoutMs(
          testOptions({ projectRoot, environment: policyEnvironment(projectRoot) }),
          files,
        ),
      ).toBe(expected);
      expect(
        testTimeoutMs(
          testOptions({ projectRoot, environment: policyEnvironment(projectRoot) }),
          files,
          { hooks: false },
        ),
      ).toBe(expected);
    },
  );

  it('runs the tests that time a rerun one at a time', () => {
    expect(workerCount(testOptions({}))).toBe(4);
    expect(
      workerCount(testOptions({ rerun: { files: [], namePattern: '^$', withoutMockPin: false } })),
    ).toBe(1);
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
