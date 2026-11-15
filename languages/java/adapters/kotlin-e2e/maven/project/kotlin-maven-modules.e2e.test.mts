import path from 'node:path';
import { cpSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterAll, describe, expect, it } from 'vitest';
import { BAD } from '../../test-support/kotlin-lint-data.mts';
import {
  copyFixture,
  kotlinE2eEnabled,
  kotlinPolicy,
  kotlinSources,
  removeTree,
} from '../__tests__/kotlin-maven-project.mts';
import { collectJavaFindings } from '../../test-support/views/kotlin-e2e-views.mts';
import type { Finding } from '../../../../../../shared/values/findings.mts';
import { fieldOf, textOf } from '../../../../../../shared/values/readers.mts';

const maven = process.env['NITPICKER_MAVEN'];

const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
const adapters = path.resolve(import.meta.dirname, '../../..');
const temporary: string[] = [];

const WAITS = `package demo

import kotlinx.coroutines.delay

suspend fun pause() {
    delay(1)
}
`;

function comparable(findings: readonly Finding[]): string[] {
  return findings.map((finding) => JSON.stringify(finding)).sort();
}

function gradleCopy() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-gradle-e2e-'));
  temporary.push(root);
  cpSync(path.join(adapters, 'fixtures/kotlin-project'), root, { recursive: true });
  return root;
}

function mavenCopy(name: string): string {
  const { root } = copyFixture(name);
  temporary.push(root);
  return root;
}

afterAll(() => {
  for (const root of temporary.splice(0)) {
    removeTree(root);
  }
});

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset on Maven: equivalence and modules', () => {
  it('finds exactly what the Gradle build of the same sources finds', () => {
    const gradleProject = gradleCopy();
    const mavenProject = mavenCopy('kotlin-single');
    for (const root of [gradleProject, mavenProject]) {
      writeFileSync(path.join(root, kotlinSources, 'Bad.kt'), BAD);
      writeFileSync(path.join(root, kotlinSources, 'Waits.kt'), WAITS);
    }
    const fromGradle = collectJavaFindings(gradleProject, { gradle, policy: kotlinPolicy });
    const fromMaven = collectJavaFindings(mavenProject, { maven, policy: kotlinPolicy });

    expect(comparable(fromMaven)).toEqual(comparable(fromGradle));
    expect([...new Set(fromMaven.map(({ tool }) => tool))].sort()).toEqual([
      'coupling',
      'detekt',
      'jacoco',
      'ktlint',
      'pit',
      'test-runtime',
    ]);
  });

  it('analyzes the Kotlin modules of a reactor and the Java-only module next to them', () => {
    const project = mavenCopy('kotlin-multi-module');
    const findings = collectJavaFindings(project, {
      maven,
      policy: { ...kotlinPolicy, testSeconds: { unitTestSeconds: -1 } },
    });
    const metrics = (file: string) =>
      findings
        .filter((finding) => finding.path === file && finding['metric'] !== undefined)
        .map(
          ({ tool, metric }) =>
            `${tool} ${textOf(fieldOf(metric, 'name'))} ${textOf(fieldOf(metric, 'value'))}`,
        )
        .sort();

    expect(metrics('core/src/main/kotlin/demo/core/Adder.kt')).toEqual([
      'coupling fanIn 1',
      'coupling fanOut 0',
      'coupling instability 0',
      'coupling totalCoupling 1',
      'jacoco line-coverage 100',
    ]);
    expect(metrics('app/src/main/kotlin/demo/app/Total.kt')).toEqual([
      'coupling fanIn 0',
      'coupling fanOut 1',
      'coupling instability 1',
      'coupling totalCoupling 1',
      'jacoco line-coverage 100',
    ]);
    expect(metrics('util/src/main/java/demo/util/Joiner.java')).toEqual([
      'coupling fanIn 0',
      'coupling fanOut 0',
      'coupling totalCoupling 0',
      'jacoco line-coverage 100',
    ]);
    expect(
      findings
        .filter((finding) => finding.tool === 'test-runtime')
        .filter((finding) => finding.classification === 'enforceable')
        .map(({ rule, path: file, identity }) => `${rule} ${file} ${identity}`),
    ).toEqual([
      'slow-test core/src/test/kotlin/demo/core/AdderTest.kt test:demo.core.AdderTest#adds',
      'slow-test app/src/test/kotlin/demo/app/TotalTest.kt test:demo.app.TotalTest#sums',
      'slow-test util/src/test/java/demo/util/JoinerTest.java test:demo.util.JoinerTest#joins',
    ]);
    expect(
      ['core', 'app', 'util'].map((module) =>
        existsSync(path.join(project, module, 'target/nitpicker/kotlin-metrics.json')),
      ),
    ).toEqual([true, true, false]);
  });
});
