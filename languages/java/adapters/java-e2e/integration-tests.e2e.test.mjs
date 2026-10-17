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
const policy = { testSeconds: { integrationTestSeconds: -1 } };
const temporary = [];

function projectOf(fixture, { sources = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-integration-e2e-'));
  temporary.push(root);
  cpSync(fixture, root, { recursive: true });
  if (sources) {
    cpSync(path.join(failsafeFixture, 'src'), path.join(root, 'src'), { recursive: true });
  }
  return root;
}

const comparable = (findings) =>
  findings
    .filter(({ tool }) => tool !== 'test-runtime')
    .map((finding) => JSON.stringify(finding))
    .sort();

const slowTests = (findings) =>
  findings
    .filter(({ tool }) => tool === 'test-runtime')
    .map(({ path: file, message }) => `${file}: ${message.split(' took ')[0]}`);

const coverage = (findings) =>
  findings.filter(({ tool }) => tool === 'jacoco').map(({ message }) => message);

afterAll(() => {
  for (const root of temporary.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(!enabled)('integration tests on Gradle and Maven', () => {
  it(
    'give a Test task wired to check the findings Failsafe gives the same sources under verify',
    () => {
      const fromGradle = collectJavaFindings(
        projectOf(path.join(fixtures, 'integration-tasks'), { sources: true }),
        { gradle, policy },
      );
      const fromMaven = collectJavaFindings(projectOf(failsafeFixture), { maven, policy });

      expect(comparable(fromGradle)).toEqual(comparable(fromMaven));
      expect(coverage(fromGradle)).toEqual(['line-coverage 100% (3/3)']);
      expect(slowTests(fromGradle)).toEqual([
        'src/test/java/demo/GreeterIT.java: GreeterIT saysGoodbye()',
      ]);
      expect(slowTests(fromMaven)).toEqual([
        'src/test/java/demo/GreeterIT.java: GreeterIT saysGoodbye',
      ]);
    },
    2 * GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'run for a jvm-test-suite in its own source set, covering code only they reach',
    () => {
      const project = projectOf(path.join(fixtures, 'integration-suite'), { sources: true });
      mkdirSync(path.join(project, 'src/integrationTest/java/demo'), { recursive: true });
      renameSync(
        path.join(project, 'src/test/java/demo/GreeterIT.java'),
        path.join(project, 'src/integrationTest/java/demo/GreeterIT.java'),
      );

      const findings = collectJavaFindings(project, { gradle, policy });

      expect(coverage(findings)).toEqual(['line-coverage 100% (3/3)']);
      expect(slowTests(findings)).toEqual([
        'src/integrationTest/java/demo/GreeterIT.java: GreeterIT saysGoodbye()',
      ]);
      expect(
        findings
          .filter(({ tool }) => tool === 'pit')
          .map(({ rule, identity }) => `${rule} ${identity}`),
      ).toEqual(['mutation-summary status:Killed']);
      expect(existsSync(path.join(project, 'build/test-results/integrationTest'))).toBe(true);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
