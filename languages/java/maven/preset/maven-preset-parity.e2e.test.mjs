import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../adapters/java-diff.mjs';
import { analyzeJavaSnapshot } from '../../adapters/java-runner.mjs';
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
      'google-java-format',
      'jacoco',
      'pit',
      'pmd',
      'spotbugs',
      'structure',
    ]);
  }, 180_000);
  it('reports a failing test as a maven-failure tool error that names the test', () => {
    const project = copyOf(path.join(fixtures, 'multi-module'));
    writeFileSync(path.join(project, 'core/src/test/java/demo/core/AdderTest.java'), FAILING_TEST);
    const [finding] = analyzeJavaSnapshot(project, { maven, policy: {} }).findings;

    expect(finding).toEqual({
      tool: 'java',
      rule: 'maven-failure',
      path: '.',
      identity: 'maven-failure',
      classification: 'tool-error',
      message: [
        `Tests fail in ${path.join(project, 'core')}; nitpicker needs a passing test suite ` +
          'for coverage and mutation testing:',
        '  demo.core.AdderTest.adds: expected: <4> but was: <3>',
      ].join('\n'),
    });
  }, 180_000);
});
