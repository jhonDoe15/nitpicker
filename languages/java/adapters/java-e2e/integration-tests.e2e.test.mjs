import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
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

function moveIntegrationTest(project) {
  mkdirSync(path.join(project, 'src/integrationTest/java/demo'), { recursive: true });
  renameSync(
    path.join(project, 'src/test/java/demo/GreeterIT.java'),
    path.join(project, 'src/integrationTest/java/demo/GreeterIT.java'),
  );
}

const comparable = (findings) =>
  findings
    .filter(({ tool }) => tool !== 'test-runtime')
    .map((finding) => JSON.stringify(finding))
    .sort();

const slowTests = (findings) =>
  findings
    .filter(({ tool, rule }) => tool === 'test-runtime' && rule === 'slow-test')
    .map(({ path: file, message }) => `${file}: ${message.split(' took ')[0]}`);

const coverage = (findings) =>
  findings.filter(({ tool }) => tool === 'jacoco').map(({ message }) => message);

const mutations = (findings) =>
  findings.filter(({ tool }) => tool === 'pit').map(({ rule, identity }) => `${rule} ${identity}`);

const LAYER_TEST = 'src/integrationTest/java/demo/LayerArchTest.java';
const FULL_COVERAGE = ['line-coverage 100% (3/3)'];
const WITHOUT_FAREWELL = [
  'line-coverage 66.67% (2/3)',
  'Method demo.Greeter#farewell(Ljava/lang/String;)Ljava/lang/String; is not covered',
];

afterAll(() => {
  for (const root of temporary.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(!enabled)('integration tests on Gradle and Maven', () => {
  const runs = {};
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
    const project = projectOf(path.join(fixtures, 'integration-suite'), { sources: true });
    moveIntegrationTest(project);
    const test = path.join(project, 'src/integrationTest/java/demo/GreeterIT.java');
    writeFileSync(
      test,
      readFileSync(test, 'utf8')
        .replace(
          'import org.junit.jupiter.api.Test;',
          'import org.junit.jupiter.api.Tag;\nimport org.junit.jupiter.api.Test;',
        )
        .replace('class GreeterIT', '@Tag("integration")\nclass GreeterIT'),
    );
    writeFileSync(
      path.join(project, 'src/integrationTest/java/demo/LayerArchTest.java'),
      'package demo;\n\nimport org.junit.jupiter.api.Test;\n\nclass LayerArchTest {\n  @Test\n  void layersHold() {\n    throw new AssertionError("layer violated");\n  }\n}\n',
    );
    runs.suite = collectJavaFindings(project, { gradle, policy });
  }, 180_000);
  beforeAll(() => {
    const project = projectOf(path.join(fixtures, 'integration-unwired'), { sources: true });
    moveIntegrationTest(project);
    runs.unwired = collectJavaFindings(project, { gradle, policy });
  }, 180_000);
  beforeAll(() => {
    const project = projectOf(path.join(fixtures, 'integration-skippable'), { sources: true });
    runs.beforeSkip = collectJavaFindings(project, { gradle, policy });
    writeFileSync(path.join(project, 'skip-integration-tests'), '');
    runs.afterSkip = collectJavaFindings(project, { gradle, policy });
  }, 180_000);

  beforeAll(() => {
    const project = projectOf(path.join(fixtures, 'integration-tasks'), { sources: true });
    const test = path.join(project, 'src/test/java/demo/GreeterIT.java');
    writeFileSync(test, readFileSync(test, 'utf8').replace('Goodbye, Ada', 'Nope'));
    try {
      collectJavaFindings(project, { gradle, policy });
    } catch (error) {
      runs.failure = error.message
        .replaceAll(project, '<project>')
        .replace(/^Full Gradle log: \S+\n/u, '');
    }
  }, 180_000);

  it('give a Test task wired to check the findings Failsafe gives the same sources under verify', () => {
    expect(comparable(runs.tasks)).toEqual(comparable(runs.maven));
    expect(coverage(runs.tasks)).toEqual(FULL_COVERAGE);
    expect(mutations(runs.tasks)).toEqual(['mutation-summary status:Killed']);
    expect(slowTests(runs.tasks)).toEqual([
      'src/test/java/demo/GreeterIT.java: GreeterIT saysGoodbye()',
    ]);
    expect(slowTests(runs.maven)).toEqual([
      'src/test/java/demo/GreeterIT.java: GreeterIT saysGoodbye',
    ]);
  });

  it('run for a suite wired to check, with its own tags and library versions, in one report', () => {
    expect(coverage(runs.suite)).toEqual(FULL_COVERAGE);
    expect(mutations(runs.suite)).toEqual(['mutation-summary status:Killed']);
    expect(slowTests(runs.suite)).toEqual([
      'src/integrationTest/java/demo/GreeterIT.java: GreeterIT saysGoodbye()',
    ]);
  });

  it('report an ArchUnit class of a checked suite as a finding instead of failing the build', () => {
    expect(
      runs.suite
        .filter(({ tool }) => tool === 'archunit')
        .map(({ rule, path: file, message }) => `${rule} ${file}: ${message}`),
    ).toEqual([
      `layersHold() ${LAYER_TEST}: ArchUnit rule layersHold() failed without reporting violations. ${exceptionHint('archunit/layersHold()', LAYER_TEST)}`,
    ]);
  });

  it('leave a suite alone that the project does not wire to check', () => {
    expect(coverage(runs.unwired)).toEqual(WITHOUT_FAREWELL);
    expect(slowTests(runs.unwired)).toEqual([]);
  });

  it('count a skipped integration task nowhere, not even from its earlier run', () => {
    expect(coverage(runs.beforeSkip)).toEqual(FULL_COVERAGE);
    expect(coverage(runs.afterSkip)).toEqual(WITHOUT_FAREWELL);
    expect(slowTests(runs.afterSkip)).toEqual([]);
    expect(mutations(runs.afterSkip)).toEqual([
      'mutant-nocoverage Greeter|farewell(LString;)LString;|EmptyObjectReturnValsMutator|replaced return value with "" for Greeter::farewell#1',
      'mutation-summary status:NoCoverage',
      'mutation-summary status:Killed',
    ]);
  });

  it('fail the build naming the failing cases of a checked integration task', () => {
    expect(runs.failure).toEqual(
      'Tests fail in <project>; nitpicker needs a passing test suite for coverage and mutation testing:\n' +
        '  demo.GreeterIT.saysGoodbye: expected: <Nope> but was: <Goodbye, Ada>',
    );
  });
});
