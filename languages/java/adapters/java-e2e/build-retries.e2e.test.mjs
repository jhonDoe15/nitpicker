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
        const message = collectJavaFindings(project, { gradle, policy: {} }).find(
          ({ rule }) => rule === 'tests-failed',
        )?.message;

        expect(message).toEqual(
          '1 test fails; coverage, CRAP and mutation were skipped. Fix the tests and rerun:\n' +
            `  demo/GreeterTest.java:22 > ${FAILURE}: first attempt ==> expected: <true> but was: <false>`,
        );
      },
      180_000,
    );

    it('fails on Maven with a rerunFailingTestsCount set in the POM', () => {
      const project = projectOf('maven');

      const message = collectJavaFindings(project, { maven, policy: {} }).find(
        ({ rule }) => rule === 'tests-failed',
      )?.message;

      expect(message).toEqual(
        '1 test fails; coverage, CRAP and mutation were skipped. Fix the tests and rerun:\n' +
          `  demo/GreeterTest.java:22 > ${FAILURE}: failed, then passed on a rerun (fix the flaky test; nitpicker counts a rerun as a failure): first attempt ==> ` +
          'expected: <true> but was: <false>',
      );
    }, 180_000);
  },
);
