import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { createJavaAnalyzer } from '../../../languages/java/adapters/java-analyzer.mjs';
import { analyzeJavaSnapshot } from '../../../languages/java/adapters/java-runner.mjs';
import { JAVA_TOOLS } from '../../../languages/java/adapters/gradle-presets.mjs';
import { commit, fixtureGit } from '../../diff/git/test-support/git-repository.mjs';
import { fakeGradle, useGradleFixtures } from './test-support/java-cli-harness.mjs';
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
    expect(analyzer.reportedTools).toEqual([...JAVA_TOOLS, 'detekt', 'ktlint', 'ktfmt']);
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
        message: `Java preset failed in ${root}: detekt crashed`,
        classification: 'tool-error',
      },
    ]);
  });
});
describe('a root project without Nitpicker reports', () => {
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
        message: `The ${preset} preset found no Gradle reports in build/nitpicker: the root project must apply the ${plugin} plugin. Reports of submodules are not read`,
        classification: 'tool-error',
      },
    ]);
  });
});
const PINNED_TOOLS = [
  'pmd',
  'spotbugs',
  'googleJavaFormat',
  'jacoco',
  'checkstyle',
  'lizard',
  'pitest',
  'pitestJunit5',
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
        message: `Java preset failed in ${root}: tool crashed`,
        classification: 'tool-error',
      },
    ]);
  });
});
