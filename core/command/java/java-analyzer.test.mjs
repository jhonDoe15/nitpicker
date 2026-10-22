import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exactText } from '../../diff/reporting/test-support/output-expectations.mjs';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { createJavaAnalyzer } from '../../../languages/java/adapters/java-analyzer.mjs';
import { analyzeJavaSnapshot } from '../../../languages/java/adapters/java-runner.mjs';
import { JAVA_TOOLS } from '../../../languages/java/adapters/gradle-presets.mjs';
import { commit, fixtureGit } from '../../diff/git/test-support/git-repository.mjs';
import {
  fakeGradle,
  gradleFailureMessage,
  useGradleFixtures,
} from './test-support/java-cli-harness.mjs';
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
      gradle: fakeGradle,
      policy: { preset: 'kotlin' },
    });

    expect(findings).toEqual([
      {
        tool: 'kotlin',
        rule: 'gradle-failure',
        path: '.',
        identity: 'gradle-failure',
        message: gradleFailureMessage(`Java preset failed in ${root}: detekt crashed`),
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

    const { findings } = analyzeJavaSnapshot(root, { gradle: fakeGradle, policy: { preset } });

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

    const { findings } = analyzeJavaSnapshot(root, { gradle: fakeGradle });

    expect(findings).toEqual([
      {
        tool: 'java',
        rule: 'gradle-failure',
        path: '.',
        identity: 'gradle-failure',
        message: gradleFailureMessage(`Java preset failed in ${root}: tool crashed`),
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
      writeFiles(root, { GRADLE_FAIL: stderr, GRADLE_STDOUT: stdout });

      const { findings } = analyzeJavaSnapshot(root, { gradle: fakeGradle });
      const message = findings[0].message;
      const log = /Full Gradle log: ([^\n]+)/u.exec(message)?.[1];
      try {
        expect(message).toEqual(gradleFailureMessage(`Java preset failed in ${root}: ${expected}`));
        expect(readFileSync(log, 'utf8')).toBe(
          `=== stdout ===\n${stdout}\n=== stderr ===\n${stderr}\n`,
        );
      } finally {
        rmSync(path.dirname(log), { recursive: true, force: true });
      }
    },
  );
  it('keeps the reason first and full output after snapshot cleanup on both sides', () => {
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

    const result = run(root);
    const errors = result.json('tool-errors.json');

    expect(result.exitCode).toBe(2);
    expect(errors.map(({ snapshot }) => snapshot).sort()).toEqual(['base', 'head']);
    for (const error of errors) {
      const log = /Full Gradle log: ([^\n]+)/u.exec(error.message)?.[1];
      expect(log).toBeDefined();
      try {
        const text = readFileSync(log, 'utf8');
        expect(text).toBe(`=== stdout ===\nfull stdout marker\n=== stderr ===\n${failure}\n`);
        expect(error.message).toEqual(
          expect.stringMatching(exactText`Full Gradle log: ${log}
Java preset failed in ${error.snapshot}: FAILURE: Build failed with an exception.
* What went wrong:
Execution failed for task ':test'.
> There were failing tests. See the report at: build/reports/tests/test/index.html
...
${/(?:warning: ordinary compiler noise\n)+warning: [a-z ]+/}`),
        );
        expect(error.message.length).toBeLessThanOrEqual(4003);
      } finally {
        rmSync(path.dirname(log), { recursive: true, force: true });
      }
    }
  });
});
