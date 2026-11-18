import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exceptionHint as exceptionHintUntyped } from '../../../../../shared/rules/exceptions.mjs';
import { textOf } from '../../../../../shared/values/readers.mts';
import { collectJavaFindings } from '../../java-diff.mts';
import type { JavaFinding } from '../../typed/java-values.mts';
import { type Runs, ranOf } from '../test-support/views/runs.mts';
import {
  FAILSAFE_FIXTURE,
  FULL_COVERAGE,
  INTEGRATION_FIXTURES,
  INTEGRATION_POLICY,
  comparable,
  coverage,
  moveIntegrationTest,
  mutations,
  slowTests,
  useIntegrationProjects,
} from '../test-support/integration-projects.mts';

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
const maven = process.env['NITPICKER_MAVEN'];
const policy = INTEGRATION_POLICY;
const fixtures = INTEGRATION_FIXTURES;
const projectOf = useIntegrationProjects();

const exceptionHint: (rule: string, file: string) => string = exceptionHintUntyped;
const LAYER_TEST = 'src/integrationTest/java/demo/LayerArchTest.java';

describe.skipIf(!enabled)('integration tests wired to check on Gradle and Maven', () => {
  const runs: Runs<'maven' | 'suite' | 'tasks', readonly JavaFinding[]> = {};
  beforeAll(() => {
    runs.tasks = collectJavaFindings(
      projectOf(path.join(fixtures, 'integration-tasks'), { sources: true }),
      { gradle, policy },
    );
  }, 180_000);

  beforeAll(() => {
    runs.maven = collectJavaFindings(projectOf(FAILSAFE_FIXTURE), { maven, policy });
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

  it('give a Test task wired to check the findings Failsafe gives the same sources under verify', () => {
    expect(comparable(ranOf(runs, 'tasks'))).toEqual(comparable(ranOf(runs, 'maven')));
    expect(coverage(ranOf(runs, 'tasks'))).toEqual(FULL_COVERAGE);
    expect(mutations(ranOf(runs, 'tasks'))).toEqual(['mutation-summary status:Killed']);
    expect(slowTests(ranOf(runs, 'tasks'))).toEqual([
      'src/test/java/demo/GreeterIT.java: GreeterIT saysGoodbye()',
    ]);
    expect(slowTests(ranOf(runs, 'maven'))).toEqual([
      'src/test/java/demo/GreeterIT.java: GreeterIT saysGoodbye',
    ]);
  });

  it('run for a suite wired to check, with its own tags and library versions, in one report', () => {
    expect(coverage(ranOf(runs, 'suite'))).toEqual(FULL_COVERAGE);
    expect(mutations(ranOf(runs, 'suite'))).toEqual(['mutation-summary status:Killed']);
    expect(slowTests(ranOf(runs, 'suite'))).toEqual([
      'src/integrationTest/java/demo/GreeterIT.java: GreeterIT saysGoodbye()',
    ]);
  });

  it('report an ArchUnit class of a checked suite as a finding instead of failing the build', () => {
    expect(
      ranOf(runs, 'suite')
        .filter(({ tool }) => tool === 'archunit')
        .map(({ rule, path: file, message }) => `${rule} ${file}: ${textOf(message)}`),
    ).toEqual([
      `layersHold() ${LAYER_TEST}: ArchUnit rule layersHold() failed without reporting violations. ${exceptionHint('archunit/layersHold()', LAYER_TEST)}`,
    ]);
  });
});
