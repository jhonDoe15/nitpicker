import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exceptionHint as exceptionHintUntyped } from '../../../../../shared/rules/exceptions.mjs';
import { textOf } from '../../../../../shared/values/readers.mts';
import { collectJavaFindings } from '../../java-diff.mts';
import type { JavaFinding } from '../../typed/java-values.mts';
import { type Runs, ranOf } from '../test-support/views/runs.mts';
import {
  FULL_COVERAGE,
  WITHOUT_FAREWELL,
  coverage,
  enabled,
  fixtures,
  gradle,
  moveIntegrationTest,
  mutations,
  policy,
  slowTests,
  useIntegrationProjects,
} from '../__tests__/integration-support.mts';

const exceptionHint: (rule: string, file: string) => string = exceptionHintUntyped;
const LAYER_TEST = 'src/integrationTest/java/demo/LayerArchTest.java';

describe.skipIf(!enabled)('an integration suite wired to check or left unwired', () => {
  const projectOf = useIntegrationProjects();
  const runs: Runs<'suite' | 'unwired', readonly JavaFinding[]> = {};
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
      path.join(project, LAYER_TEST),
      'package demo;\n\nimport org.junit.jupiter.api.Test;\n\nclass LayerArchTest {\n  @Test\n  void layersHold() {\n    throw new AssertionError("layer violated");\n  }\n}\n',
    );
    runs.suite = collectJavaFindings(project, { gradle, policy });
  }, 180_000);
  beforeAll(() => {
    const project = projectOf(path.join(fixtures, 'integration-unwired'), { sources: true });
    moveIntegrationTest(project);
    runs.unwired = collectJavaFindings(project, { gradle, policy });
  }, 180_000);

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

  it('leave a suite alone that the project does not wire to check', () => {
    expect(coverage(ranOf(runs, 'unwired'))).toEqual(WITHOUT_FAREWELL);
    expect(slowTests(ranOf(runs, 'unwired'))).toEqual([]);
  });
});
