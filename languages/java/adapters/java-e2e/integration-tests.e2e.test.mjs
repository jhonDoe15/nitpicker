import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';
import { GRADLE_STEP_TIMEOUT_MS } from '../test-support/gradle-e2e.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const maven = process.env.NITPICKER_MAVEN;
const fixtures = path.join(import.meta.dirname, '../fixtures');
const failsafeFixture = path.join(import.meta.dirname, '../../maven/fixtures/failsafe');
const temporary = [];

function copyOf(...sources) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-integration-e2e-'));
  temporary.push(root);
  for (const source of sources) {
    cpSync(source, root, { recursive: true });
  }
  return root;
}

const withoutDurations = (findings) =>
  findings
    .map((finding) => JSON.stringify(finding).replaceAll(/took [\d.]+ s/gu, 'took N s'))
    .sort();

afterAll(() => {
  for (const root of temporary.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(!enabled)('integration tests on Gradle and Maven', () => {
  it(
    'report what Maven reports for the same sources when a Test task is wired to check as Failsafe is to verify',
    () => {
      const gradleProject = copyOf(
        path.join(failsafeFixture, 'src'),
        path.join(fixtures, 'integration-tasks'),
      );
      const mavenProject = copyOf(failsafeFixture);
      const policy = { testSeconds: { integrationTestSeconds: -1 } };

      const fromGradle = collectJavaFindings(gradleProject, { gradle, policy });
      const fromMaven = collectJavaFindings(mavenProject, { maven, policy });

      expect(withoutDurations(fromGradle)).toEqual(withoutDurations(fromMaven));
      expect(
        fromGradle
          .filter((finding) => ['jacoco', 'test-runtime'].includes(finding.tool))
          .map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`),
      ).toEqual([
        'jacoco line-coverage src/main/java/demo/Greeter.java',
        'test-runtime slow-test src/test/java/demo/GreeterIT.java',
      ]);
    },
    2 * GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'are run for a jvm-test-suite, covering code only they reach and timed against the integration budget',
    () => {
      const project = copyOf(
        path.join(failsafeFixture, 'src'),
        path.join(fixtures, 'integration-suite'),
      );
      mkdirSync(path.join(project, 'src/integrationTest/java/demo'), { recursive: true });
      renameSync(
        path.join(project, 'src/test/java/demo/GreeterIT.java'),
        path.join(project, 'src/integrationTest/java/demo/GreeterIT.java'),
      );
      const findings = collectJavaFindings(project, {
        gradle,
        policy: { testSeconds: { integrationTestSeconds: -1 } },
      });

      expect(
        ['test', 'integrationTest'].map((task) =>
          existsSync(path.join(project, 'build/test-results', task)),
        ),
      ).toEqual([true, true]);
      expect(findings.filter((finding) => finding.tool === 'jacoco')).toEqual([]);
      expect(findings.filter((finding) => finding.tool === 'test-runtime')).toEqual([]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
