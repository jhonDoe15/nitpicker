import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';

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
  const runs = {};
  const suiteProject = () => {
    const project = projectOf(path.join(fixtures, 'integration-suite'), { sources: true });
    mkdirSync(path.join(project, 'src/integrationTest/java/demo'), { recursive: true });
    renameSync(
      path.join(project, 'src/test/java/demo/GreeterIT.java'),
      path.join(project, 'src/integrationTest/java/demo/GreeterIT.java'),
    );
    return project;
  };
  beforeAll(() => {
    runs.tasks = collectJavaFindings(
      projectOf(path.join(fixtures, 'integration-tasks'), { sources: true }),
      { gradle, policy },
    );
  }, 180_000);
  beforeAll(() => {
    runs.maven = collectJavaFindings(projectOf(failsafeFixture), { maven, policy });
  }, 180_000);
  beforeAll(() => {
    runs.suiteProject = suiteProject();
    runs.suite = collectJavaFindings(runs.suiteProject, { gradle, policy });
  }, 180_000);

  it('give a Test task wired to check the findings Failsafe gives the same sources under verify', () => {
    expect(comparable(runs.tasks)).toEqual(comparable(runs.maven));
    expect(coverage(runs.tasks)).toEqual(['line-coverage 100% (3/3)']);
    expect(slowTests(runs.tasks)).toEqual([
      'src/test/java/demo/GreeterIT.java: GreeterIT saysGoodbye()',
    ]);
    expect(slowTests(runs.maven)).toEqual([
      'src/test/java/demo/GreeterIT.java: GreeterIT saysGoodbye',
    ]);
  });

  it('run for a jvm-test-suite in its own source set, covering code only they reach', () => {
    expect(coverage(runs.suite)).toEqual(['line-coverage 100% (3/3)']);
    expect(slowTests(runs.suite)).toEqual([
      'src/integrationTest/java/demo/GreeterIT.java: GreeterIT saysGoodbye()',
    ]);
    expect(
      runs.suite
        .filter(({ tool }) => tool === 'pit')
        .map(({ rule, identity }) => `${rule} ${identity}`),
    ).toEqual(['mutation-summary status:Killed']);
    expect(existsSync(path.join(runs.suiteProject, 'build/test-results/integrationTest'))).toBe(
      true,
    );
  });
});
