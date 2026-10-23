import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJavaAnalyzer } from './java-analyzer.mjs';
import { analyzeJavaSnapshot } from './java-runner.mjs';
import { linkSentence } from '../../../shared/messages/test-support/link-sentence.mjs';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal()),
  spawnSync: vi.fn(),
}));

const roots = [];
const MINUTE_MS = 60_000;
const BUDGET_VARIABLE = 'NITPICKER_GRADLE_TIMEOUT_MINUTES';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function runGradle() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-timeout-'));
  roots.push(root);
  const error = new Error('stop before reading reports');
  vi.mocked(spawnSync).mockReturnValue({ error });
  const message = analyzeJavaSnapshot(root, { gradle: 'gradle' }).findings[0].message;
  const logFile = message.split('\n')[0].slice('Full Gradle log: '.length);
  expect(path.relative(tmpdir(), path.dirname(logFile))).toMatch(
    /^nitpicker-gradle-failure-[\w-]+$/,
  );
  roots.push(path.dirname(logFile));
  expect(message).toBe(
    `Full Gradle log: ${logFile}\n${error.message}\n${linkSentence('gradleFails')}`,
  );
  expect(readFileSync(logFile, 'utf8')).toBe('=== stdout ===\n\n=== stderr ===\n');
  return JSON.parse(vi.mocked(spawnSync).mock.calls[0][2].input).options.timeout;
}

describe('the Gradle execution budget', () => {
  it('keeps the 15-minute command default and allows both stages plus report overhead', () => {
    vi.stubEnv(BUDGET_VARIABLE, undefined);

    expect(runGradle()).toBe(15 * MINUTE_MS);
    expect(createJavaAnalyzer().timeoutMs).toBe(31 * MINUTE_MS);
  });

  it.each([1, 45, 17895])(
    'uses %i minutes for Gradle and the derived Java/Kotlin deadline',
    (minutes) => {
      vi.stubEnv(BUDGET_VARIABLE, String(minutes));

      expect(runGradle()).toBe(minutes * MINUTE_MS);
      for (const kotlin of [false, true]) {
        const analyzer = createJavaAnalyzer({ kotlin });
        expect(analyzer.timeoutMs).toBe((2 * minutes + 1) * MINUTE_MS);
        for (const snapshot of ['base', 'head']) {
          const invocation = analyzer.createInvocation({
            projectRoot: '/project',
            toolRoot: '/tools',
            snapshot,
          });
          expect(invocation.env).toBeUndefined();
        }
      }
    },
  );

  it.each(['0', '-1', '', '1.5', '45m', 'Infinity', 'NaN', '17896', '1e2', ' 15 '])(
    'rejects invalid minutes %j before starting Gradle',
    (value) => {
      vi.stubEnv(BUDGET_VARIABLE, value);

      expect(() => createJavaAnalyzer()).toThrow(/NITPICKER_GRADLE_TIMEOUT_MINUTES/);
      const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-timeout-'));
      roots.push(root);
      expect(analyzeJavaSnapshot(root, { gradle: 'gradle' }).findings[0].message).toMatch(
        /NITPICKER_GRADLE_TIMEOUT_MINUTES/,
      );
      expect(spawnSync).not.toHaveBeenCalled();
    },
  );
});
