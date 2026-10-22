import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../adapters/java-diff.mjs';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';
import {
  SPRING_ARCH_FIXTURE,
  SPRING_ARCH_VIOLATIONS,
} from '../../adapters/spring/__tests__/spring-arch-project.mjs';
import {
  useMavenPresetProject,
  enabled,
  gradle,
  maven,
  fixtures,
  copyOf,
} from '../__tests__/maven-preset-project.mjs';

const SPRING_LAYOUT_FINDINGS = [
  'src/main/java/shop/Helper.java Helper',
  'src/main/java/shop/adapter/in/web/PaymentController.java PaymentController|adapter',
  'src/main/java/shop/adapter/out/persistence/PaymentJpaAdapter.java PaymentJpaAdapter|adapter',
  'src/main/java/shop/application/port/in/PayUseCase.java PayUseCase|application',
  'src/main/java/shop/application/port/out/PaymentStore.java PaymentStore|application',
  'src/main/java/shop/application/service/PayService.java PayService|application',
  'src/main/java/shop/domain/model/Payment.java Payment|domain',
  'src/main/java/shop/exception/OrderNotFound.java OrderNotFound|exception',
  'src/main/java/shop/service/Legacy.java Legacy|service',
  'src/main/java/shop/util/Strings.java Strings|util',
];
const SPRING_TEST_PLACEMENT_FINDINGS = [
  'src/test/java/shop/OrderFlowTest.java',
  'src/test/java/shop/orders/ComposedTest.java',
  'src/test/java/shop/orders/ExtendedTest.java',
  'src/test/java/shop/orders/InheritedTest.java',
  'src/test/java/shop/orders/RepositoryTest.java',
];

function rulePaths(findings, rule) {
  return findings.filter((finding) => finding.rule === rule).map((finding) => finding.path);
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

function runSpringArchTask(root) {
  const result = spawnSync(
    gradle,
    ['--console=plain', '--quiet', '-I', INIT_SCRIPT, 'nitpickerSpringArch'],
    { cwd: root, encoding: 'utf8', timeout: 180_000 },
  );
  if (result.status !== 0) {
    throw new Error(`Gradle nitpickerSpringArch failed: ${result.stderr}`);
  }
}

describe.skipIf(!enabled)('Spring architecture rules on Maven builds', () => {
  useMavenPresetProject();
  it('reports the Spring architecture violations Gradle reports', () => {
    const gradleProject = copyOf(SPRING_ARCH_FIXTURE);
    const mavenProject = copyOf(SPRING_ARCH_FIXTURE, path.join(fixtures, 'spring-arch'));
    for (const name of ['build.gradle', 'settings.gradle']) {
      rmSync(path.join(mavenProject, name));
    }
    for (const root of [gradleProject, mavenProject]) {
      withoutRunnableTests(root);
    }
    runSpringArchTask(gradleProject);
    const findings = collectJavaFindings(mavenProject, { maven, policy: {} });
    const fromMaven = readReport(mavenProject, 'target', 'spring-arch.json');
    const manifest = readReport(mavenProject, 'target', 'manifest.json');

    expect(fromMaven).toEqual(readReport(gradleProject, 'build', 'spring-arch.json'));
    expect(
      fromMaven.violations.map(({ rule, className, detail }) => `${rule} ${className} ${detail}`),
    ).toEqual(SPRING_ARCH_VIOLATIONS);
    expect([manifest.spring, manifest.springArch, manifest.runsFailsafe]).toEqual([
      true,
      true,
      false,
    ]);
    expect(
      findings
        .filter((finding) => finding.rule === 'spring-layout')
        .map((finding) => `${finding.path} ${finding.identity}`),
    ).toEqual(SPRING_LAYOUT_FINDINGS);
    expect(rulePaths(findings, 'spring-test-placement')).toEqual(SPRING_TEST_PLACEMENT_FINDINGS);
    expect(rulePaths(findings, 'spring-feature-boundary')).toEqual([
      'src/main/java/shop/billing/BillingService.java',
      'src/main/java/shop/billing/Invoices.java',
    ]);
  }, 180_000);
});
