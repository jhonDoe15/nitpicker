import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../../cli.mts';
import { commit } from '../../../diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../diff/git/test-support/fixture-files.mjs';
import { useGradleFixtures, useMavenFixtures } from '../test-support/java-cli-harness.mjs';

const EMPTY_JDEPS = { 'jdeps/jdeps.txt': '', 'jdeps/jdeps-classes.txt': '' };
const HINT = 'The code does not compile; fix it before anything else is checked.';
const SKIPPED = (errors, preset) =>
  `The change does not compile (${errors}), so the build stopped and the other ${preset} checks ` +
  'did not run. Fix the build/compile-error findings and rerun.';

function compileFindings(result) {
  return result
    .json('new-findings.json')
    .map(({ tool, rule, path, location, message, classification }) => ({
      finding: `${tool}/${rule} ${path}:${String(location?.line)}`,
      message,
      classification,
    }));
}

describe.each([
  [
    'a Gradle build',
    useGradleFixtures,
    {
      GRADLE_FAIL:
        'src/main/java/demo/A.java:3: error: cannot find symbol\n  symbol:   class Missing',
    },
    'gradle-failure',
  ],
  [
    'a Maven build',
    useMavenFixtures,
    {
      MAVEN_FAIL:
        'src/main/java/demo/A.java:[3,8] cannot find symbol\n[ERROR]   symbol:   class Missing',
    },
    'maven-failure',
  ],
])('a Java change that does not compile on %s', (_name, useFixtures, broken, failureRule) => {
  const { run, ...fixtures } = useFixtures(nitpickerCli);
  const repository = (files = {}) => fixtures.repository({ ...EMPTY_JDEPS, ...files });

  it('fails with each compile error as a finding at its line, and says the other checks did not run', () => {
    const root = repository();
    writeFiles(root, broken);
    commit(root, 'break the build');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(compileFindings(result)).toEqual([
      {
        finding: 'build/compile-error src/main/java/demo/A.java:3',
        message: `cannot find symbol (class Missing). ${HINT}`,
        classification: 'enforceable',
      },
    ]);
    expect(result.json('resolved-findings.json')).toEqual([]);
    expect(result.json('tool-errors.json')).toEqual([
      {
        tool: 'java',
        snapshot: 'head',
        rule: 'compile-failed-skipped',
        path: '.',
        message: SKIPPED('1 compile error', 'Java'),
      },
    ]);
    expect(result.output.out.split('\n').filter((line) => line.startsWith('  build/'))).toEqual([
      `  build/compile-error: cannot find symbol (class Missing). ${HINT}`,
    ]);
  });

  it('reports no finding but a tool error when the base does not compile either', () => {
    const root = repository(broken);
    writeFiles(root, { 'notes.txt': 'edited\n' });
    commit(root, 'edit notes');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.json('new-findings.json')).toEqual([]);
    expect(
      result.json('tool-errors.json').map(({ snapshot, rule }) => `${snapshot} ${rule}`),
    ).toEqual(['head compile-failed-skipped', `base ${failureRule}`]);
  });
});

describe('a change that does not compile next to a base whose tests fail', () => {
  const { run, gradleRepository, kotlinRepository, build } = useGradleFixtures(nitpickerCli);
  const failing =
    '<testsuite name="demo.ATest"><testcase classname="demo.ATest" name="works">' +
    '<failure message="expected: 1"/></testcase></testsuite>';

  it('still fails on the compile error, which the base cannot have', () => {
    const root = gradleRepository({ ...EMPTY_JDEPS, ...build.redBase.files(failing) });
    writeFiles(root, { GRADLE_FAIL: 'src/main/java/demo/A.java:3: error: cannot find symbol' });
    commit(root, 'break the build');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(compileFindings(result).map(({ finding }) => finding)).toEqual([
      'build/compile-error src/main/java/demo/A.java:3',
    ]);
  });

  it('reports a Kotlin compile error on Gradle the same way', () => {
    const root = kotlinRepository();
    writeFiles(root, {
      'src/main/kotlin/demo/A.kt': 'package demo\n\nclass A {\n    val x = missing()\n}\n',
      GRADLE_FAIL: "e: src/main/kotlin/demo/A.kt:4:9 Unresolved reference 'missing'.",
    });
    commit(root, 'break the build');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(compileFindings(result)).toEqual([
      {
        finding: 'build/compile-error src/main/kotlin/demo/A.kt:4',
        message: `Unresolved reference 'missing'. ${HINT}`,
        classification: 'enforceable',
      },
    ]);
    expect(result.json('tool-errors.json').map(({ message }) => message)).toEqual([
      SKIPPED('1 compile error', 'Kotlin'),
    ]);
  });
});
