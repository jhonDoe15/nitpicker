import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { collectJavaFindings, runJavaDiff } from '../adapters/java-diff.mjs';
import { analyzeJavaSnapshot } from '../adapters/java-runner.mjs';
import { testCasesOf } from '../adapters/test-times/slow-tests.mjs';
import {
  commitBranch,
  GRADLE_STEP_TIMEOUT_MS,
  runGitIn,
} from '../adapters/test-support/gradle-e2e.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const maven = process.env.NITPICKER_MAVEN;
const fixtures = path.join(import.meta.dirname, 'fixtures');
const gradleFixture = path.join(import.meta.dirname, '../adapters/fixtures/gradle-project');
const temporary = [];

const DATED = `package demo;

import java.util.Date;

public class Dated {
    public Date now(int a, int b, int c, int d) {
        if (a > 0) { if (b > 0) { if (c > 0) { if (d > 0) { return new Date(); } } } }
        try { Integer.parseInt("x"); } catch (NumberFormatException e) { }
        return new Date(new String(new byte[] {1}).length());
    }

    public String shout(String text) {
        return text.toUpperCase();
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

function copiedTestCases(project) {
  const results = path.join(project, 'target/nitpicker/test-results');
  return readdirSync(results)
    .sort()
    .flatMap((task) =>
      readdirSync(path.join(results, task))
        .sort()
        .flatMap((name) => testCasesOf(readFileSync(path.join(results, task, name), 'utf8'), task)),
    );
}

function lineCoverage(text, value) {
  return {
    tool: 'jacoco',
    rule: 'line-coverage',
    path: 'src/main/java/demo/Greeter.java',
    identity: 'line-coverage',
    metric: { name: 'line-coverage', value },
    message: `line-coverage ${text}`,
    classification: 'descriptive',
  };
}

const comparable = (findings) => findings.map((finding) => JSON.stringify(finding)).sort();

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
        'errorprone',
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
          .filter((finding) => ['errorprone', 'pmd'].includes(finding.tool))
          .map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`),
      ).toEqual([
        'errorprone PrivateConstructorForUtilityClass app/src/main/java/demo/app/Main.java',
        'errorprone SystemOut app/src/main/java/demo/app/Main.java',
      ]);
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
    'runs verify when Failsafe is bound, counting its tests for coverage and the integration budget',
    () => {
      const project = copyOf(path.join(fixtures, 'failsafe'));
      const findings = collectJavaFindings(project, {
        maven,
        policy: { testSeconds: { integrationTestSeconds: -1 } },
      });
      const cases = copiedTestCases(project);
      const seconds = cases[0].seconds.toFixed(1);
      const exception =
        '{"rule":"test-runtime/slow-test","paths":["src/test/java/demo/GreeterIT.java"],"reason":"..."}';

      expect(cases.map(({ task, className, name }) => `${task} ${className}#${name}`)).toEqual([
        'failsafe demo.GreeterIT#saysGoodbye',
        'surefire demo.GreeterTest#greets',
      ]);
      expect(existsSync(path.join(project, 'target/greeter-1.0.jar'))).toBe(true);
      expect(findings.filter((finding) => finding.tool === 'jacoco')).toEqual([
        lineCoverage('100% (3/3)', 100),
      ]);
      expect(findings.filter((finding) => finding.tool === 'test-runtime')).toEqual([
        {
          tool: 'test-runtime',
          rule: 'slow-test',
          path: 'src/test/java/demo/GreeterIT.java',
          identity: 'test:demo.GreeterIT#saysGoodbye',
          location: { line: 9 },
          message:
            `GreeterIT saysGoodbye took ${seconds} s; an integration test may take -1 s. ` +
            'Remove Thread.sleep and other waits, start a smaller Spring context or a test slice. ' +
            `If this is intended, add ${exception} to "exceptions" in nitpicker.config.json.`,
          classification: 'enforceable',
        },
      ]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'stays on test when the project keeps its integration tests off with skipITs',
    () => {
      const project = copyOf(path.join(fixtures, 'failsafe'));
      const pom = path.join(project, 'pom.xml');
      writeFileSync(
        pom,
        readFileSync(pom, 'utf8').replace('<properties>', '<properties><skipITs>true</skipITs>'),
      );
      const findings = collectJavaFindings(project, { maven, policy: {} });

      expect(
        copiedTestCases(project).map(({ task, className, name }) => `${task} ${className}#${name}`),
      ).toEqual(['surefire demo.GreeterTest#greets']);
      expect(
        ['target/failsafe-reports', 'target/greeter-1.0.jar'].map((file) =>
          existsSync(path.join(project, file)),
        ),
      ).toEqual([false, false]);
      expect(findings.filter((finding) => finding.tool === 'jacoco')).toEqual([
        lineCoverage('66.67% (2/3)', 66.67),
        {
          tool: 'jacoco',
          rule: 'uncovered-method',
          path: 'src/main/java/demo/Greeter.java',
          identity: 'cov:a14fde8c431ba476',
          symbol: 'demo.Greeter#farewell(Ljava/lang/String;)Ljava/lang/String;',
          message:
            'Method demo.Greeter#farewell(Ljava/lang/String;)Ljava/lang/String; is not covered',
          classification: 'descriptive',
        },
      ]);
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
        ['errorprone EmptyCatch', 'pit mutant-nocoverage'].map(
          (finding) => `${finding} app/src/main/java/demo/app/Parser.java`,
        ),
      );
    },
    2 * GRADLE_STEP_TIMEOUT_MS,
  );
});
