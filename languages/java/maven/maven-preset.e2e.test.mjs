import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { collectJavaFindings, runJavaDiff } from '../adapters/java-diff.mjs';
import { analyzeJavaSnapshot } from '../adapters/java-runner.mjs';
import {
  commitBranch,
  GRADLE_STEP_TIMEOUT_MS,
  runGitIn,
} from '../adapters/test-support/gradle-e2e.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const maven = process.env.NITPICKER_MAVEN;
const fixtures = path.join(import.meta.dirname, 'fixtures');
const gradleFixtures = path.join(import.meta.dirname, '../adapters/fixtures');
const gradleFixture = path.join(gradleFixtures, 'gradle-project');
const BUILD_FILES = new Set(['build.gradle', 'pom.xml']);
const temporary = [];

const DATED = `package demo;

import java.util.Date;

public class Dated {
    public Date now(int a, int b, int c, int d) {
        if (a > 0) { if (b > 0) { if (c > 0) { if (d > 0) { return new Date(); } } } }
        try { Integer.parseInt("x"); } catch (NumberFormatException e) { }
        return new Date(new String(new byte[] {1}).length());
    }
}
`;

const EMPTY_CATCH = `package demo.app;

public final class Parser {
  public int parse(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
    }
    return 0;
  }
}
`;

const FAILING_TEST = `package demo.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class AdderTest {
  @Test
  void adds() {
    assertEquals(4, new Adder().add(1, 2));
  }
}
`;

function copyOf(...sources) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-e2e-'));
  temporary.push(root);
  for (const source of sources) {
    cpSync(source, root, { recursive: true });
  }
  return root;
}

const comparable = (findings) => findings.map((finding) => JSON.stringify(finding)).sort();

function withoutGradle(root) {
  for (const name of readdirSync(root, { recursive: true })) {
    if (/(?:^|[/\\])(?:build|settings)\.gradle$/u.test(name)) {
      rmSync(path.join(root, name));
    }
  }
  return root;
}

function onEitherBuildFile(findings) {
  return findings.map((finding) =>
    BUILD_FILES.has(finding.path) ? { ...finding, path: 'build file', message: '' } : finding,
  );
}

afterAll(() => {
  for (const root of temporary.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(!enabled)('Java preset on Maven builds', () => {
  it(
    'finds exactly what the Gradle build of the same sources finds',
    () => {
      const gradleProject = copyOf(gradleFixture);
      const mavenProject = copyOf(gradleFixture, path.join(fixtures, 'single'));
      for (const name of ['build.gradle', 'settings.gradle']) {
        rmSync(path.join(mavenProject, name));
      }
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
        'forbiddenapis',
        'google-java-format',
        'jacoco',
        'pit',
        'pmd',
        'spotbugs',
        'structure',
      ]);
    },
    2 * GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'finds exactly the guard findings the Gradle build of the same sources finds',
    () => {
      const guards = path.join(gradleFixtures, 'guards-project');
      const gradleProject = copyOf(guards);
      const mavenProject = withoutGradle(copyOf(guards, path.join(fixtures, 'guards')));
      const fromGradle = collectJavaFindings(gradleProject, { gradle, policy: {} });
      const fromMaven = collectJavaFindings(mavenProject, { maven, policy: {} });

      expect(comparable(onEitherBuildFile(fromMaven))).toEqual(
        comparable(onEitherBuildFile(fromGradle)),
      );
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
    },
    2 * GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'lints modules with a javac plug-in, preview, a descriptor, an outside source root, Lombok or an older release',
    () => {
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
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'reads every module of a reactor under the module path, with coupling across modules',
    () => {
      const project = copyOf(path.join(fixtures, 'multi-module'));
      const findings = collectJavaFindings(project, {
        maven,
        policy: { testSeconds: { unitTestSeconds: -1 } },
      });
      const metrics = (file) =>
        findings
          .filter((finding) => finding.path === file && finding.metric !== undefined)
          .map(({ tool, metric }) => `${tool} ${metric.name} ${String(metric.value)}`)
          .sort();

      expect(
        findings
          .filter((finding) => finding.tool === 'pmd')
          .map(({ rule, path: file }) => `${rule} ${file}`),
      ).toEqual(['SystemPrintln app/src/main/java/demo/app/Main.java']);
      expect(metrics('core/src/main/java/demo/core/Adder.java')).toEqual([
        'coupling fanIn 1',
        'coupling fanOut 0',
        'coupling instability 0',
        'coupling totalCoupling 1',
        'jacoco line-coverage 100',
      ]);
      expect([...new Set(findings.map((finding) => finding.path))].sort()).toEqual([
        '.',
        'app',
        'app/src/main/java/demo/app/Main.java',
        'checks/src/test/java/demo/checks/AdderIT.java',
        'core',
        'core/src/main/java/demo/core/Adder.java',
        'core/src/test/java/demo/core/AdderTest.java',
      ]);
      expect(
        findings
          .filter((finding) => finding.tool === 'test-runtime')
          .map(({ rule, path: file, identity }) => `${rule} ${file} ${identity}`),
      ).toEqual([
        'slow-test core/src/test/java/demo/core/AdderTest.java test:demo.core.AdderTest#adds',
      ]);
      expect(
        existsSync(
          path.join(
            project,
            'core/target/nitpicker/test-results/surefire/TEST-demo.core.AdderTest.xml',
          ),
        ),
      ).toBe(true);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'reports a failing test as a maven-failure tool error that names the test',
    () => {
      const project = copyOf(path.join(fixtures, 'multi-module'));
      writeFileSync(
        path.join(project, 'core/src/test/java/demo/core/AdderTest.java'),
        FAILING_TEST,
      );
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
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'fails a change only on what it adds',
    () => {
      const repository = copyOf(path.join(fixtures, 'multi-module'));
      runGitIn(repository, 'init', '-q', '-b', 'main');
      runGitIn(repository, 'add', '-A');
      runGitIn(repository, 'commit', '-q', '-m', 'base');
      commitBranch(repository, 'parser', { 'app/src/main/java/demo/app/Parser.java': EMPTY_CATCH });
      const result = runJavaDiff({
        repositoryRoot: repository,
        requestedBaseRef: 'main',
        maven,
        policy: {},
      });
      const failing = result.newEnforceable.map(
        ({ tool, rule, path: file }) => `${tool} ${rule} ${file}`,
      );

      expect(failing).toEqual(
        [
          'checkstyle com.puppycrawl.tools.checkstyle.checks.blocks.EmptyCatchBlockCheck',
          'pit mutant-nocoverage',
          'pmd EmptyCatchBlock',
        ].map((finding) => `${finding} app/src/main/java/demo/app/Parser.java`),
      );
    },
    2 * GRADLE_STEP_TIMEOUT_MS,
  );
});
