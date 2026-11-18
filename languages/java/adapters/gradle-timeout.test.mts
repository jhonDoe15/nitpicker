import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJavaAnalyzer } from './java-analyzer.mts';
import { MAVEN_FAILURE_RULE, analyzeJavaSnapshot, withPitDeadline } from './java-runner.mts';
import { fieldOf, parseJson, textOf } from '../../../shared/values/readers.mts';
import { linkSentence } from '../../../shared/messages/test-support/link-sentence.mjs';

const spawnMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal()),
  spawnSync: spawnMock,
}));

const roots: string[] = [];
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
  spawnMock.mockReturnValue({ error });
  const logRoot = path.join(root, 'logs');
  const policy = { logRoot, logLabel: 'logs' };
  const message = analyzeJavaSnapshot(root, { gradle: 'gradle', policy }).findings[0]?.message;
  expect(message).toBe(
    `${error.message}\nFull Gradle log: logs/java-head-gradle.log\n${String(linkSentence('gradleFails'))}`,
  );
  expect(readFileSync(path.join(logRoot, 'java-head-gradle.log'), 'utf8')).toBe(
    '=== stdout ===\n\n=== stderr ===\n',
  );
  return fieldOf(
    fieldOf(parseJson(textOf(fieldOf(spawnMock.mock.calls[0]?.[2], 'input'))), 'options'),
    'timeout',
  );
}

function runMavenBuild() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-timeout-'));
  roots.push(root);
  writeFileSync(path.join(root, 'pom.xml'), '<project/>');
  spawnMock.mockReturnValue({ status: 1, stdout: '', stderr: 'stop' });
  expect(analyzeJavaSnapshot(root, { maven: 'mvn' }).findings[0]?.rule).toBe(MAVEN_FAILURE_RULE);
  return fieldOf(spawnMock.mock.calls[0]?.[2], 'timeout');
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
      const analyzers = [false, true].map((kotlin) => createJavaAnalyzer({ kotlin }));
      const invocations = analyzers.flatMap((analyzer) =>
        ['base', 'head'].map((snapshot) => {
          const context = { projectRoot: '/project', toolRoot: '/tools', snapshot };
          return analyzer.createInvocation(context);
        }),
      );
      expect(analyzers.map(({ timeoutMs }) => timeoutMs)).toEqual(
        analyzers.map(() => (2 * minutes + 1) * MINUTE_MS),
      );
      expect(invocations.map((invocation) => fieldOf(invocation, 'env'))).toEqual(
        invocations.map(() => undefined),
      );
    },
  );

  it.each(['0', '-1', '', '1.5', '45m', 'Infinity', 'NaN', '17896', '1e2', ' 15 '])(
    'rejects invalid minutes %j before starting Gradle',
    (value) => {
      vi.stubEnv(BUDGET_VARIABLE, value);

      expect(() => createJavaAnalyzer()).toThrow(/NITPICKER_GRADLE_TIMEOUT_MINUTES/);
      const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-timeout-'));
      roots.push(root);
      expect(analyzeJavaSnapshot(root, { gradle: 'gradle' }).findings[0]?.message).toMatch(
        /^[\s\S]*NITPICKER_GRADLE_TIMEOUT_MINUTES[\s\S]*$/u,
      );
      expect(spawnMock).not.toHaveBeenCalled();
    },
  );
});

describe('a Gradle command that runs out of time', () => {
  it('names the variable that gives it more time', () => {
    vi.stubEnv(BUDGET_VARIABLE, '7');
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-timeout-'));
    roots.push(root);
    spawnMock.mockReturnValue({ error: { code: 'ETIMEDOUT', message: 'ETIMEDOUT' } });

    const message = analyzeJavaSnapshot(root, { gradle: 'gradle' }).findings[0]?.message;

    expect(message).toBe(
      `Gradle did not finish in ${root} within 7 minutes and was stopped. ` +
        'Set NITPICKER_GRADLE_TIMEOUT_MINUTES to give each Gradle command more time',
    );
  });
});

describe('the Maven execution budget', () => {
  const MAVEN_VARIABLE = 'NITPICKER_MAVEN_TIMEOUT_MINUTES';

  it('keeps 15 minutes per Maven command by default', () => {
    vi.stubEnv(MAVEN_VARIABLE, undefined);
    vi.stubEnv(BUDGET_VARIABLE, undefined);

    expect(runMavenBuild()).toBe(15 * MINUTE_MS);
    expect(createJavaAnalyzer().timeoutMs).toBe(31 * MINUTE_MS);
  });

  it('uses the Maven variable for each command and widens the Java/Kotlin deadline', () => {
    vi.stubEnv(MAVEN_VARIABLE, '45');
    vi.stubEnv(BUDGET_VARIABLE, '10');

    expect(runMavenBuild()).toBe(45 * MINUTE_MS);
    expect([
      createJavaAnalyzer().timeoutMs,
      createJavaAnalyzer({ kotlin: true }).timeoutMs,
    ]).toEqual([91 * MINUTE_MS, 91 * MINUTE_MS]);
  });

  it.each(['0', '', '1.5', '45m', '17896'])('rejects invalid minutes %j', (value) => {
    vi.stubEnv(MAVEN_VARIABLE, value);

    expect(() => createJavaAnalyzer()).toThrow(/NITPICKER_MAVEN_TIMEOUT_MINUTES/);
  });
});

describe('a configured analyzer deadline inside the Java runner', () => {
  it('lifts the Gradle and Maven command defaults, unless a build variable is set', () => {
    vi.stubEnv('NITPICKER_ANALYZER_TIMEOUT_MS', String(90 * MINUTE_MS));
    vi.stubEnv(BUDGET_VARIABLE, undefined);
    vi.stubEnv('NITPICKER_MAVEN_TIMEOUT_MINUTES', undefined);

    expect(runGradle()).toBe(90 * MINUTE_MS);
    spawnMock.mockClear();
    expect(runMavenBuild()).toBe(90 * MINUTE_MS);
    vi.stubEnv('NITPICKER_MAVEN_TIMEOUT_MINUTES', '20');
    spawnMock.mockClear();
    expect(runMavenBuild()).toBe(20 * MINUTE_MS);
  });
});

describe('the deadline of Maven mutation testing', () => {
  it('ends two minutes before the analyzer is stopped', () => {
    const budget = { analyzerTimeoutMs: 31 * MINUTE_MS };

    expect(withPitDeadline(budget, {}, 0).pitDeadlineMs).toBe(29 * MINUTE_MS);
    expect(
      withPitDeadline(budget, { NITPICKER_ANALYZER_TIMEOUT_MS: String(10 * MINUTE_MS) }, 0)
        .pitDeadlineMs,
    ).toBe(8 * MINUTE_MS);
  });
});
