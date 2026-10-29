import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../adapters/java-diff.mjs';
import {
  useMavenPresetProject,
  enabled,
  gradle,
  maven,
  fixtures,
  copyOf,
  comparable,
} from '../__tests__/maven-preset-project.mjs';
const gradleFixtures = path.join(import.meta.dirname, '../../adapters/fixtures');
const BUILD_FILES = new Set(['build.gradle', 'pom.xml']);
function withoutGradle(root) {
  for (const name of readdirSync(root, { recursive: true })) {
    if (/(?:^|[/\\])(?:build|settings)\.gradle$/u.test(name)) {
      rmSync(path.join(root, name));
    }
  }
  return root;
}

function acrossBuilds(findings) {
  return findings
    .filter(({ tool, rule }) => `${tool}/${rule}` !== 'test-runtime/slow-test')
    .map((finding) =>
      BUILD_FILES.has(finding.path) ? { ...finding, path: 'build file', message: '' } : finding,
    );
}

describe.skipIf(!enabled)('Maven guard parity and compile modes', () => {
  useMavenPresetProject();
  it('finds exactly the guard findings the Gradle build of the same sources finds, test times aside (they vary by run)', () => {
    const guards = path.join(gradleFixtures, 'guards-project');
    const gradleProject = copyOf(guards);
    const mavenProject = withoutGradle(copyOf(guards, path.join(fixtures, 'guards')));
    const fromGradle = collectJavaFindings(gradleProject, { gradle, policy: {} });
    const fromMaven = collectJavaFindings(mavenProject, { maven, policy: {} });

    expect(comparable(acrossBuilds(fromMaven))).toEqual(comparable(acrossBuilds(fromGradle)));
    expect(
      fromMaven
        .filter((finding) => finding.tool === 'dependencies')
        .map(({ path: file, identity, message }) => [file, identity, message.split('. ')[0]]),
    ).toEqual([
      [
        'pom.xml',
        'unused:org.apache.commons:commons-text',
        'Dependency org.apache.commons:commons-text has compile scope but no main class uses it',
      ],
    ]);
    expect(
      ['javac', 'forbiddenapis', 'duplicates', 'coupling'].map((tool) =>
        fromMaven.some(
          (finding) => finding.tool === tool && finding.classification === 'enforceable',
        ),
      ),
    ).toEqual([true, true, true, true]);
    expect(
      fromMaven
        .filter((finding) => finding.tool === 'javac' && finding.path.startsWith('src/test/'))
        .map(({ path: file, rule, location }) => `${file}:${String(location.line)} ${rule}`),
    ).toEqual([
      'src/test/java/guards/TypesTest.java:13 rawtypes',
      'src/test/java/guards/TypesTest.java:13 rawtypes',
      'src/test/java/guards/TypesTest.java:14 unchecked',
      'src/test/java/guards/TypesTest.java:15 unchecked',
      'src/test/java/guards/TypesTest.java:16 cast',
    ]);
    expect(
      fromMaven
        .filter((finding) => finding.rule === 'TestClassWithoutTestCases')
        .map(({ path: file, location }) => `${file}:${String(location.line)}`),
    ).toEqual([
      'src/test/java/guards/GreetingFixturesTest.java:3',
      'src/test/java/guards/HelpersTest.java:3',
    ]);
  }, 180_000);

  it('lints modules with a javac plug-in, preview, a descriptor, an outside source root, Lombok or an older release', () => {
    const project = withoutGradle(
      copyOf(
        path.join(gradleFixtures, 'guards-compile-modes'),
        path.join(fixtures, 'guards-compile-modes'),
      ),
    );
    const findings = collectJavaFindings(project, { maven, policy: {} });
    const watched = new Set(['OptionalGet', 'InstanceofThenCast', 'CollectorsToList']);

    expect(
      findings
        .filter((finding) => finding.tool === 'javac' || finding.toolNotRun === true)
        .map(({ path: file, rule, location }) => `${file}:${String(location?.line)} ${rule}`),
    ).toEqual([
      'plugged/src/main/java/plugged/Names.java:7 rawtypes',
      'preview/src/main/java/preview/Names.java:7 rawtypes',
      'modular/src/main/java/modular/shapes/Shape.java:10 rawtypes',
      'outside/src/main/java/outside/Names.java:7 rawtypes',
      'lombok/src/main/java/fluent/Item.java:18 rawtypes',
    ]);
    expect(
      findings
        .filter((finding) => finding.path.startsWith('legacy/') && watched.has(finding.rule))
        .map((finding) => finding.rule),
    ).toEqual(['OptionalGet']);
    expect(
      findings
        .filter((finding) => finding.tool === 'coupling' && finding.path.startsWith('modular/'))
        .map(({ path: file, metric }) => `${file} ${metric.name} ${String(metric.value)}`),
    ).toEqual(
      [
        'Labels.java fanIn 0',
        'Labels.java fanOut 1',
        'Labels.java totalCoupling 1',
        'Labels.java instability 1',
        'Shape.java fanIn 3',
        'Shape.java fanOut 2',
        'Shape.java totalCoupling 5',
        'Shape.java instability 0.4',
        'impl/Circle.java fanIn 1',
        'impl/Circle.java fanOut 1',
        'impl/Circle.java totalCoupling 2',
        'impl/Circle.java instability 0.5',
        'impl/Square.java fanIn 1',
        'impl/Square.java fanOut 1',
        'impl/Square.java totalCoupling 2',
        'impl/Square.java instability 0.5',
      ].map((line) => `modular/src/main/java/modular/shapes/${line}`),
    );
  }, 180_000);
});
