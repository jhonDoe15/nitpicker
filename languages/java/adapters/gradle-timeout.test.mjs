import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJavaAnalyzer } from './java-analyzer.mjs';
import { analyzeJavaSnapshot } from './java-runner.mjs';

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
  expect(message).toBe(`Full Gradle log: ${logFile}\n${error.message}`);
  expect(readFileSync(logFile, 'utf8')).toBe('=== stdout ===\n\n=== stderr ===\n');
  return JSON.parse(vi.mocked(spawnSync).mock.calls[0][2].input).options.timeout;
}

function runMavenBuild() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-timeout-'));
  roots.push(root);
  writeFileSync(path.join(root, 'pom.xml'), '<project/>');
  vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: 'stop' });
  expect(analyzeJavaSnapshot(root, { maven: 'mvn' }).findings[0].rule).toBe('maven-failure');
  return vi.mocked(spawnSync).mock.calls[0][2].timeout;
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
        ['base', 'head'].map((snapshot) =>
          analyzer.createInvocation({ projectRoot: '/project', toolRoot: '/tools', snapshot }),
        ),
      );
      expect(analyzers.map(({ timeoutMs }) => timeoutMs)).toEqual(
        analyzers.map(() => (2 * minutes + 1) * MINUTE_MS),
      );
      expect(invocations.map(({ env }) => env)).toEqual(invocations.map(() => undefined));
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

describe('a Gradle command that runs out of time', () => {
  it('names the variable that gives it more time', () => {
    vi.stubEnv(BUDGET_VARIABLE, '7');
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-timeout-'));
    roots.push(root);
    vi.mocked(spawnSync).mockReturnValue({ error: { code: 'ETIMEDOUT', message: 'ETIMEDOUT' } });

    const message = analyzeJavaSnapshot(root, { gradle: 'gradle' }).findings[0].message;
    roots.push(path.dirname(message.split('\n')[0].slice('Full Gradle log: '.length)));

    expect(message.split('\n').slice(1)).toEqual([
      `Gradle did not finish in ${root} within 7 minutes and was stopped. ` +
        'Set NITPICKER_GRADLE_TIMEOUT_MINUTES to give each Gradle command more time',
    ]);
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
    vi.mocked(spawnSync).mockClear();
    expect(runMavenBuild()).toBe(90 * MINUTE_MS);
    vi.stubEnv('NITPICKER_MAVEN_TIMEOUT_MINUTES', '20');
    vi.mocked(spawnSync).mockClear();
    expect(runMavenBuild()).toBe(20 * MINUTE_MS);
  });
});
