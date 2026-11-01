import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../adapters/java-diff.mjs';
import { analyzeJavaSnapshot } from '../../adapters/java-runner.mjs';
import {
  LIBRARY_CALLS,
  LIBRARY_CALLS_TEST,
} from '../../adapters/kotlin-e2e/test-support/kotlin-branch-coverage-data.mjs';
import {
  useMavenPresetProject,
  enabled,
  gradle,
  maven,
  fixtures,
  DATED,
  FAILING_TEST,
  SHAPES,
  SHAPES_TEST,
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
      'test-runtime',
    ]);
  }, 180_000);
  it('reports no untaken branch in sealed and enum switches or interfaces, on Gradle and Maven', () => {
    const [gradleProject, mavenProject] = twinProjects();
    const coverage = (findings) =>
      findings.filter(
        ({ tool, path: file }) => tool === 'jacoco' && file.endsWith('demo/Shapes.java'),
      );
    for (const root of [gradleProject, mavenProject]) {
      writeFileSync(path.join(root, 'src/main/java/demo/Shapes.java'), SHAPES);
      writeFileSync(path.join(root, 'src/test/java/demo/ShapesTest.java'), SHAPES_TEST);
    }
    const fromGradle = coverage(collectJavaFindings(gradleProject, { gradle, policy: {} }));
    const fromMaven = coverage(collectJavaFindings(mavenProject, { maven, policy: {} }));

    expect(fromMaven.map(({ rule }) => rule)).toEqual(['line-coverage']);
    expect(comparable(fromMaven)).toEqual(comparable(fromGradle));
  }, 180_000);
  it('filters the inlined library branches of Kotlin sources as the Kotlin preset does', () => {
    const project = copyOf(path.join(fixtures, 'kotlin'));
    for (const [file, text] of [
      ['src/main/kotlin/demo/Library.kt', LIBRARY_CALLS],
      ['src/test/kotlin/demo/LibraryTest.kt', LIBRARY_CALLS_TEST],
    ]) {
      mkdirSync(path.dirname(path.join(project, file)), { recursive: true });
      writeFileSync(path.join(project, file), text);
    }
    const findings = collectJavaFindings(project, { maven, policy: {} });

    expect(
      findings
        .filter(({ rule }) => rule === 'changed-branch-coverage')
        .map(({ path: file, location }) => `${path.basename(file)}:${String(location.line)}`)
        .sort(),
    ).toEqual(['Library.kt:12', 'Library.kt:14', 'Library.kt:18']);
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
