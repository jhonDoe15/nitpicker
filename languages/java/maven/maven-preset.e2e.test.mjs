import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { collectJavaFindings, runJavaDiff } from '../adapters/java-diff.mjs';
import { analyzeJavaSnapshot } from '../adapters/java-runner.mjs';
import { INIT_SCRIPT } from '../builds/java-build.mjs';
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
const springFixture = path.join(import.meta.dirname, '../adapters/fixtures/spring-arch-project');
const temporary = [];

const SPRING_VIOLATIONS = [
  'spring-controller-entity shop.orders.OrderController all:shop.orders.Order',
  'spring-controller-entity shop.orders.OrderController create:shop.orders.Order',
  'spring-controller-entity shop.orders.OrdersApiController list:shop.orders.Order',
  'spring-controller-entity shop.orders.ReportController base:shop.orders.Order',
  'spring-controller-entity shop.orders.ReportController model:shop.orders.Order',
  'spring-controller-repository shop.customers.CustomerController shop.orders.OrderRepository',
  'spring-controller-repository shop.orders.OrderController shop.orders.OrderRepository',
  'spring-feature-boundary shop.billing.BillingService shop.orders.internal.Audit',
  'spring-feature-boundary shop.billing.Invoices shop.web.internal.Formats',
  'spring-layout shop.Helper ',
  'spring-layout shop.service.Legacy service',
  'spring-layout shop.util.Strings util',
  'spring-no-dirties-context shop.OrderFlowTest ',
  'spring-no-dirties-context shop.orders.integration.CheckoutIT ',
  'spring-service-web shop.billing.BillingService org.springframework.http.ResponseEntity',
  'spring-shared-pure shop.shared.Clocked ',
  'spring-shared-pure shop.shared.Totals shop.orders.OrderDto',
  'spring-test-placement shop.OrderFlowTest ',
  'spring-test-placement shop.orders.ComposedTest ',
  'spring-test-placement shop.orders.ExtendedTest ',
  'spring-test-placement shop.orders.InheritedTest ',
  'spring-test-placement shop.orders.RepositoryTest ',
];
const SPRING_LAYOUT_FINDINGS = [
  'src/main/java/shop/Helper.java Helper',
  'src/main/java/shop/service/Legacy.java Legacy|service',
  'src/main/java/shop/util/Strings.java Strings|util',
];

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

function withoutRunnableTests(root) {
  const tests = path.join(root, 'src/test/java');
  for (const entry of readdirSync(tests, { recursive: true, withFileTypes: true })) {
    const file = path.join(entry.parentPath, entry.name);
    if (entry.isFile()) {
      writeFileSync(file, readFileSync(file, 'utf8').replaceAll(/^\s*@Test\r?\n/gmu, ''));
    }
  }
}

function readReport(root, directory, name) {
  return JSON.parse(readFileSync(path.join(root, directory, 'nitpicker', name), 'utf8'));
}

function runGradleTask(root, task) {
  const result = spawnSync(gradle, ['--console=plain', '--quiet', '-I', INIT_SCRIPT, task], {
    cwd: root,
    encoding: 'utf8',
    timeout: GRADLE_STEP_TIMEOUT_MS,
  });
  if (result.status !== 0) {
    throw new Error(`Gradle ${task} failed: ${result.stderr}`);
  }
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
    'reports the Spring architecture violations Gradle reports',
    () => {
      const gradleProject = copyOf(springFixture);
      const mavenProject = copyOf(springFixture, path.join(fixtures, 'spring-arch'));
      for (const name of ['build.gradle', 'settings.gradle']) {
        rmSync(path.join(mavenProject, name));
      }
      for (const root of [gradleProject, mavenProject]) {
        withoutRunnableTests(root);
      }
      runGradleTask(gradleProject, 'nitpickerSpringArch');
      const findings = collectJavaFindings(mavenProject, { maven, policy: {} });
      const fromMaven = readReport(mavenProject, 'target', 'spring-arch.json');
      const manifest = readReport(mavenProject, 'target', 'manifest.json');

      expect(fromMaven).toEqual(readReport(gradleProject, 'build', 'spring-arch.json'));
      expect(
        fromMaven.violations.map(({ rule, className, detail }) => `${rule} ${className} ${detail}`),
      ).toEqual(SPRING_VIOLATIONS);
      expect([manifest.spring, manifest.springArch]).toEqual([true, true]);
      expect(
        findings
          .filter((finding) => finding.rule === 'spring-layout')
          .map((finding) => `${finding.path} ${finding.identity}`),
      ).toEqual(SPRING_LAYOUT_FINDINGS);
    },
    2 * GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'reads every module of a reactor under the module path, with coupling across modules',
    () => {
      const project = copyOf(path.join(fixtures, 'multi-module'));
      const findings = collectJavaFindings(project, { maven, policy: {} });
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
