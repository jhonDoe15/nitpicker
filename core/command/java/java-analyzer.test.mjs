import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { createJavaAnalyzer } from '../../../languages/java/adapters/java-analyzer.mjs';
import { analyzeJavaSnapshot } from '../../../languages/java/adapters/java-runner.mjs';
import { JAVA_TOOLS } from '../../../languages/java/adapters/gradle-presets.mjs';
import { commit, fixtureGit } from '../../diff/git/test-support/git-repository.mjs';
import { fakeGradleRun, useGradleFixtures } from './test-support/java-cli-harness.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';

const { kotlinRepository, run, temporaryRoot } = useGradleFixtures(nitpickerCli);

describe('Gradle failures of the kotlin analyzer', () => {
  const kotlinToolError = (snapshot) => [
    expect.objectContaining({
      tool: 'kotlin',
      snapshot,
      rule: 'gradle-failure',
      message: expect.stringContaining('compileKotlin failed'),
    }),
  ];
  it('reports a Gradle failure on head as a kotlin tool error', () => {
    const root = kotlinRepository();
    writeFiles(root, { GRADLE_FAIL: 'compileKotlin failed\n' });
    commit(root, 'break the build');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.json('tool-errors.json')).toEqual(kotlinToolError('head'));
  });
  it('reports a Gradle failure on base as a kotlin tool error', () => {
    const root = kotlinRepository({ GRADLE_FAIL: 'compileKotlin failed\n' });
    fixtureGit(root, ['rm', '-q', 'GRADLE_FAIL']);
    commit(root, 'fix the build');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.json('tool-errors.json')).toEqual(kotlinToolError('base'));
  });
});
describe('Kotlin analyzer', () => {
  it('is named kotlin, declares the Kotlin tools and starts the runner with the kotlin preset', () => {
    const analyzer = createJavaAnalyzer({ kotlin: true });
    const invocation = analyzer.createInvocation({ projectRoot: '/project', toolRoot: '/tool' });

    expect(analyzer.name).toBe('kotlin');
    expect(analyzer.reportedTools).toEqual([
      ...JAVA_TOOLS,
      'facts',
      'build',
      'detekt',
      'ktlint',
      'ktfmt',
      'kotlin-source',
      'kotlinc',
    ]);
    expect(invocation.args.slice(-2)).toEqual(['--preset', 'kotlin']);
    expect(createJavaAnalyzer().name).toBe('java');
    expect(createJavaAnalyzer().reportedTools).not.toContain('detekt');
  });
  it('maps a failing Gradle run to one tool-error finding of the kotlin analyzer', () => {
    const root = temporaryRoot('nitpicker-kotlin-unit-');
    writeFiles(root, { GRADLE_FAIL: 'detekt crashed\n' });

    const { findings } = analyzeJavaSnapshot(root, {
      ...fakeGradleRun,
      policy: { preset: 'kotlin' },
    });

    expect(findings).toEqual([
      {
        tool: 'kotlin',
        rule: 'gradle-failure',
        path: '.',
        identity: 'gradle-failure',
        message: 'Kotlin preset failed on your change: detekt crashed',
        classification: 'tool-error',
      },
    ]);
  });
});
describe('a build without a project that applies the plugin', () => {
  it.each([
    ['kotlin', 'org.jetbrains.kotlin.jvm'],
    ['java', 'java'],
  ])('is a tool error naming the plugin for the %s preset', (preset, plugin) => {
    const root = temporaryRoot('nitpicker-no-reports-');
    writeFiles(root, { NO_REPORTS: '' });

    const { findings } = analyzeJavaSnapshot(root, { ...fakeGradleRun, policy: { preset } });

    expect(findings).toEqual([
      {
        tool: preset,
        rule: 'gradle-failure',
        path: '.',
        identity: 'gradle-failure',
        message: `The ${preset} preset found no Gradle project that applies the ${plugin} plugin`,
        classification: 'tool-error',
      },
    ]);
  });
});
const PINNED_TOOLS = [
  'pmd',
  'spotbugs',
  'googleJavaFormat',
  'palantirJavaFormat',
  'jacoco',
  'checkstyle',
  'lizard',
  'pitest',
  'pitestJunit5',
  'pitestTestng',
  'archunit',
  'asm',
  'detekt',
  'detektKotlin',
  'ktlint',
  'ktfmt',
  'kotlinCompiler',
  'errorProne',
  'nullAway',
  'jscpd',
];

describe('Java analyzer', () => {
  it('records the pinned tool versions and a stable configuration hash', () => {
    const analyzer = createJavaAnalyzer();

    expect(analyzer.version).toMatch(
      new RegExp(`^${PINNED_TOOLS.map((tool) => `${tool}@[\\d.]+`).join(';')}$`),
    );
    expect(createJavaAnalyzer().configurationHash).toBe(analyzer.configurationHash);
  });
  it('maps a failing Gradle run to one tool-error finding', () => {
    const root = temporaryRoot('nitpicker-java-unit-');
    writeFiles(root, { GRADLE_FAIL: 'tool crashed\n' });

    const { findings } = analyzeJavaSnapshot(root, { ...fakeGradleRun });

    expect(findings).toEqual([
      {
        tool: 'java',
        rule: 'gradle-failure',
        path: '.',
        identity: 'gradle-failure',
        message: 'Java preset failed on your change: tool crashed',
        classification: 'tool-error',
      },
    ]);
  });
});

describe('Gradle failure diagnostics', () => {
  it.each([
    { stderr: 'short failure', stdout: '', expected: 'short failure' },
    { stderr: '', stdout: 'stdout failure', expected: 'stdout failure' },
    { stderr: '', stdout: '', expected: 'no diagnostic output' },
  ])(
    'keeps the short diagnostic or empty-output fallback: $expected',
    ({ stderr, stdout, expected }) => {
      const root = temporaryRoot('nitpicker-gradle-diagnostic-');
      const logRoot = path.join(temporaryRoot('nitpicker-gradle-logs-'), 'logs');
      writeFiles(root, { GRADLE_FAIL: stderr, GRADLE_STDOUT: stdout });

      const { findings } = analyzeJavaSnapshot(root, {
        ...fakeGradleRun,
        policy: { logRoot, logLabel: 'logs' },
      });

      expect(findings[0].message).toBe(
        `Java preset failed on your change: ${expected}\nFull Gradle log: logs/java-head-gradle.log`,
      );
      expect(readFileSync(path.join(logRoot, 'java-head-gradle.log'), 'utf8')).toBe(
        `=== stdout ===\n${stdout}\n=== stderr ===\n${stderr}\n`,
      );
    },
  );
  it('keeps the log line of a message that only the long log path makes overlong', () => {
    const root = temporaryRoot('nitpicker-gradle-long-');
    const logRoot = path.join(temporaryRoot('nitpicker-gradle-logs-'), 'logs');
    const lines = Array.from({ length: 20 }, (_, index) => `${String(index)}${'x'.repeat(400)}`);
    writeFiles(root, { GRADLE_FAIL: lines.join('\n') });
    const logLabel = 'l'.repeat(600);

    const { message } = analyzeJavaSnapshot(root, {
      ...fakeGradleRun,
      policy: { logRoot, logLabel },
    }).findings[0];

    expect(message.split('\n').at(-1)).toBe(`Full Gradle log: ${logLabel}/java-head-gradle.log`);
    expect(message.length).toBeGreaterThan(4000);
    expect(message).not.toContain('...');
  });

  it('keeps the cause and saves the full output under the report folder on both sides', () => {
    const failure = [
      'warning: ordinary compiler noise\n'.repeat(300),
      'FAILURE: Build failed with an exception.',
      '* What went wrong:',
      "Execution failed for task ':test'.",
      '> There were failing tests. See the report at: build/reports/tests/test/index.html',
      '* Try:',
      '> Run with --stacktrace option to get the stack trace.',
    ].join('\n');
    const root = kotlinRepository({ GRADLE_FAIL: failure, GRADLE_STDOUT: 'full stdout marker' });
    writeFiles(root, { 'change.txt': 'head change' });
    commit(root, 'change');

    const gradleLogs = () =>
      readdirSync(tmpdir()).filter((name) => name.startsWith('nitpicker-gradle-failure-'));
    const before = gradleLogs();

    const result = run(root);
    const errors = result.json('tool-errors.json');

    expect(gradleLogs()).toEqual(before);
    expect(result.exitCode).toBe(2);
    expect(errors.map(({ snapshot }) => snapshot).sort()).toEqual(['base', 'head']);
    const where = { base: 'on the base', head: 'on your change' };
    expect(errors.map(({ message }) => message)).toEqual(
      errors.map(({ snapshot }) =>
        [
          `Kotlin preset failed ${where[snapshot]}: Execution failed for task ':test'.`,
          '> There were failing tests. See the report at: build/reports/tests/test/index.html',
          `Full Gradle log: ${result.reports}/logs/kotlin-${snapshot}-gradle.log`,
        ].join('\n'),
      ),
    );
    expect(
      errors.map(({ snapshot }) =>
        readFileSync(path.join(result.reports, 'logs', `kotlin-${snapshot}-gradle.log`), 'utf8'),
      ),
    ).toEqual(errors.map(() => `=== stdout ===\nfull stdout marker\n=== stderr ===\n${failure}\n`));
  });
});
