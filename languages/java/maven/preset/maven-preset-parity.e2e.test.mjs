import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../adapters/java-diff.mjs';
import {
  useMavenPresetProject,
  enabled,
  gradle,
  maven,
  fixtures,
  DATED,
  FAILING_TEST,
  copyOf,
  twinProjects,
  comparable,
} from '../__tests__/maven-preset-project.mjs';

describe.skipIf(!enabled)('Java preset on Maven builds', () => {
  useMavenPresetProject();
  it('finds exactly what the Gradle build of the same sources finds', () => {
    const [gradleProject, mavenProject] = twinProjects();
    for (const root of [gradleProject, mavenProject]) {
      writeFileSync(path.join(root, 'src/main/java/demo/Dated.java'), DATED);
    }
    const fromGradle = collectJavaFindings(gradleProject, { gradle, policy: {} });
    const fromMaven = collectJavaFindings(mavenProject, { maven, policy: {} });
    const tools = new Set(fromMaven.map((finding) => finding.tool));

    expect(comparable(fromMaven)).toEqual(comparable(fromGradle));
    expect([...tools].sort()).toEqual([
      'archunit',
      'checkstyle',
      'coupling',
      'crap',
      'errorprone',
      'forbiddenapis',
      'google-java-format',
      'jacoco',
      'pit',
      'pmd',
      'spotbugs',
      'structure',
    ]);
  }, 180_000);
  it('still runs every analyzer when a test fails, and names the failing test', () => {
    const project = copyOf(path.join(fixtures, 'multi-module'));
    writeFileSync(path.join(project, 'core/src/test/java/demo/core/AdderTest.java'), FAILING_TEST);
    const findings = collectJavaFindings(project, {
      maven,
      policy: { testSeconds: { unitTestSeconds: -1 } },
    });

    expect(
      findings
        .filter((finding) => finding.classification === 'tool-error')
        .map(({ tool, rule, message }) => ({ tool, rule, message })),
    ).toEqual([
      {
        tool: 'tests',
        rule: 'tests-failed',
        message: [
          'Tests fail in module core of the head snapshot. Make each failing test pass:',
          '  demo.core.AdderTest.adds: expected: <4> but was: <3>',
          'The static analyzers ran as usual; coverage and CRAP come from the tests that ran.',
          'Mutation testing (PIT) did not run: every test class has a failing test, so no ' +
            'passing test is left to kill mutants.',
        ].join('\n'),
      },
      {
        tool: 'pit',
        rule: 'tests-failed-skipped',
        message:
          'Mutation testing (PIT) did not run in module core of the head snapshot: every test ' +
          'class has a failing test, so no passing test is left to kill mutants.',
      },
    ]);
    expect(
      findings
        .filter(
          (finding) =>
            ['errorprone', 'pmd'].includes(finding.tool) ||
            finding.metric?.name === 'line-coverage',
        )
        .map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`),
    ).toEqual([
      'jacoco line-coverage core/src/main/java/demo/core/Adder.java',
      'errorprone PrivateConstructorForUtilityClass app/src/main/java/demo/app/Main.java',
      'errorprone SystemOut app/src/main/java/demo/app/Main.java',
      'jacoco line-coverage app/src/main/java/demo/app/Main.java',
    ]);
  }, 180_000);
});
