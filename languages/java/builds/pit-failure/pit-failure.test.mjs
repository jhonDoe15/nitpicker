import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pitTimeoutMs, runPit } from '../../maven/pit/maven-pit.mjs';
import { pitFailureFindings } from './pit-failure.mjs';

const roots = [];

function moduleTree() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-pit-failure-'));
  roots.push(root);
  for (const file of ['classes/demo/A.class', 'test-classes/demo/ATest.class']) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), '');
  }
  return {
    root,
    module: {
      basedir: root,
      outputDirectory: path.join(root, 'classes'),
      testOutputDirectory: path.join(root, 'test-classes'),
      sourceRoots: [],
      testJvmArgs: [],
    },
  };
}

function runWith(result, timeoutMs) {
  const { root, module } = moduleTree();
  const run = () =>
    runPit({
      module,
      reportDir: root,
      tools: { pit: [] },
      classpaths: { testRuntime: [] },
      isArchunit: () => false,
      spawn: () => result,
      timeoutMs,
    });
  return { root, run };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('a PIT run that fails', () => {
  it('becomes a pit tool error of the module and leaves no mutation report', () => {
    const { root, run } = runWith({ status: 1, stdout: 'Running\n', stderr: 'boom\n' });

    expect(run).not.toThrow();
    expect(existsSync(path.join(root, 'pit', 'mutations.xml'))).toBe(false);
    expect(pitFailureFindings(root, 'shop')).toEqual([
      {
        tool: 'pit',
        rule: 'pit-failure',
        path: '.',
        identity: 'pit-failure:shop',
        symbol: 'shop',
        message: expect.stringMatching(
          /^PIT failed with exit code 1: boom\nRunning\nSee https:\/\/\S+#pit-fails-or-times-out$/u,
        ),
        classification: 'tool-error',
      },
    ]);
  });

  it('names PIT, its time limit and the variable that raises it when it runs too long', () => {
    const error = Object.assign(new Error('spawnSync java ETIMEDOUT'), { code: 'ETIMEDOUT' });
    const { root, run } = runWith({ error, status: null, stdout: '', stderr: '' }, 20 * 60_000);

    run();

    const { message } = pitFailureFindings(root)[0];

    expect(
      message.startsWith(`PIT did not finish in ${root} within 20 minutes and was stopped. `),
    ).toBe(true);
    expect(message).toContain(
      'Set NITPICKER_MAVEN_TIMEOUT_MINUTES to give each Maven command and Java tool more time. See ',
    );
    expect(message).toMatch(/#pit-fails-or-times-out$/u);
  });
});

describe('pitFailureFindings', () => {
  it('reads the failure of each PIT part of a Gradle module, and nothing without one', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-pit-failure-'));
    roots.push(root);
    mkdirSync(path.join(root, 'pit', 'integrationTest'), { recursive: true });
    mkdirSync(path.join(root, 'pit', 'test'), { recursive: true });
    writeFileSync(path.join(root, 'pit', 'integrationTest', 'failure.txt'), 'PIT failed\n');

    expect(pitFailureFindings(root, 'app').map(({ identity }) => identity)).toEqual([
      'pit-failure:app:integrationTest',
    ]);
    expect(pitFailureFindings(path.join(root, 'missing'))).toEqual([]);
  });
});

describe('the time PIT gets on Maven', () => {
  it('is the command limit, cut to the whole minutes left before the analyzer deadline', () => {
    expect(pitTimeoutMs(15 * 60_000, undefined, 0)).toBe(15 * 60_000);
    expect(pitTimeoutMs(15 * 60_000, 4.5 * 60_000, 0)).toBe(4 * 60_000);
  });

  it('is not started with less than a minute left, and says why', () => {
    const { root, module } = moduleTree();
    let spawned = false;

    runPit({
      module,
      reportDir: root,
      tools: { pit: [] },
      classpaths: { testRuntime: [] },
      isArchunit: () => false,
      spawn: () => {
        spawned = true;
        return { status: 0, stdout: '', stderr: '' };
      },
      timeoutMs: 15 * 60_000,
      deadline: Date.now() + 30_000,
    });

    expect(spawned).toBe(false);
    expect(pitFailureFindings(root)[0].message).toMatch(
      /^PIT was not started in .+: less than a minute of the Java analyzer's time limit was left\./u,
    );
  });
});
