import { appendFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const maven = process.env.NITPICKER_MAVEN;
const fixture = path.join(import.meta.dirname, '../fixtures/retried-test');
const OTHER_BUILD_FILES = { gradle: ['pom.xml'], maven: ['build.gradle', 'settings.gradle'] };
const FAILURE = 'demo.GreeterTest.passesOnlyOnItsSecondAttempt';
const temporary = [];

function projectOf(build) {
  const root = mkdtempSync(path.join(tmpdir(), `nitpicker-retries-${build}-`));
  temporary.push(root);
  cpSync(fixture, root, { recursive: true });
  for (const name of OTHER_BUILD_FILES[build]) {
    rmSync(path.join(root, name), { force: true });
  }
  return root;
}

afterAll(() => {
  for (const root of temporary.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(!enabled)(
  'Java preset on a test that only passes when the build retries it',
  () => {
    it.each([
      ['configured to retry', ''],
      [
        'enabled again by a hook that runs when the task graph is ready',
        "\ngradle.taskGraph.whenReady { graph ->\n  graph.allTasks.findAll { it.name == 'test' }.each { it.retry.maxRetries = 2 }\n}\n",
      ],
      ['and the build ignoring test failures', '\ntest.ignoreFailures = true\n'],
    ])(
      'fails on Gradle with the test-retry plugin %s',
      (_name, extra) => {
        const project = projectOf('gradle');
        appendFileSync(path.join(project, 'build.gradle'), extra);
        let message;
        try {
          collectJavaFindings(project, { gradle, policy: {} });
        } catch (error) {
          message = error.message.replace(/^Full Gradle log: \S+\n/u, '');
        }

        expect(message).toEqual(
          `Tests fail in ${project}; nitpicker needs a passing test suite for coverage and mutation ` +
            `testing:\n  ${FAILURE}: first attempt ==> expected: <true> but was: <false>`,
        );
      },
      180_000,
    );

    it('fails on Maven with a rerunFailingTestsCount set in the POM', () => {
      const project = projectOf('maven');

      expect(() => collectJavaFindings(project, { maven, policy: {} })).toThrow(
        `Tests fail in ${project}; nitpicker needs a passing test suite for coverage and mutation ` +
          `testing:\n  ${FAILURE}: failed, then passed on a rerun (fix the flaky test; nitpicker counts a rerun as a failure): first attempt ==> ` +
          'expected: <true> but was: <false>',
      );
    }, 180_000);
  },
);
