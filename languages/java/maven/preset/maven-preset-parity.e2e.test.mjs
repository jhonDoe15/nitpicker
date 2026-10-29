import { readFileSync, writeFileSync } from 'node:fs';
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

const MODE_TEST = `package demo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class ModeTest {
  @Test
  void runsWithTheJvmArgumentsOfTheBuild() {
    assertEquals("checked", System.getProperty("nitpicker.mode"));
    assertEquals("a,b", System.getProperty("nitpicker.list"));
    assertEquals("hello world", System.getProperty("nitpicker.spaced"));
    assertEquals("say \\"hi\\"", System.getProperty("nitpicker.quote"));
    assertEquals("yes", System.getProperty("nitpicker.provided"));
    assertTrue(Runtime.getRuntime().maxMemory() <= 400L * 1024 * 1024);
  }
}
`;
const GRADLE_TEST_JVM = `
class Provided implements CommandLineArgumentProvider {
    Iterable<String> asArguments() { ['-Dnitpicker.provided=yes'] }
}
tasks.test {
    jvmArgs '-Dnitpicker.mode=checked', '-Dnitpicker.list=a,b'
    systemProperty 'nitpicker.spaced', 'hello world'
    systemProperty 'nitpicker.quote', 'say "hi"'
    maxHeapSize = '384m'
    jvmArgumentProviders.add(new Provided())
}
`;
const MAVEN_ARG_LINE =
  '<argLine>-Dnitpicker.mode=checked -Dnitpicker.list=a,b "-Dnitpicker.spaced=hello world" -Xmx384m</argLine>';
const MAVEN_SYSTEM_PROPERTIES =
  '<build><plugins><plugin><groupId>org.apache.maven.plugins</groupId>' +
  '<artifactId>maven-surefire-plugin</artifactId><version>3.5.2</version>' +
  '<configuration><systemPropertyVariables><nitpicker.quote>say &quot;hi&quot;</nitpicker.quote>' +
  '<nitpicker.provided>yes</nitpicker.provided></systemPropertyVariables></configuration>' +
  '</plugin></plugins></build>';

function appendTo(file, text) {
  writeFileSync(file, `${readFileSync(file, 'utf8')}${text}`);
}

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
  it('runs PIT with the JVM arguments the tests of either build need', () => {
    const [gradleProject, mavenProject] = twinProjects();
    for (const root of [gradleProject, mavenProject]) {
      writeFileSync(path.join(root, 'src/test/java/demo/ModeTest.java'), MODE_TEST);
    }
    appendTo(path.join(gradleProject, 'build.gradle'), GRADLE_TEST_JVM);
    const pom = path.join(mavenProject, 'pom.xml');
    writeFileSync(
      pom,
      readFileSync(pom, 'utf8')
        .replace('</properties>', `${MAVEN_ARG_LINE}</properties>`)
        .replace('</project>', `${MAVEN_SYSTEM_PROPERTIES}</project>`),
    );
    const fromGradle = collectJavaFindings(gradleProject, { gradle, policy: {} });
    const fromMaven = collectJavaFindings(mavenProject, { maven, policy: {} });
    const errors = (findings) =>
      findings.filter((finding) => finding.classification === 'tool-error');

    expect([errors(fromGradle), errors(fromMaven)]).toEqual([[], []]);
    expect(comparable(fromMaven)).toEqual(comparable(fromGradle));
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
