import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exceptionHint } from '../../../../../shared/rules/exceptions.mjs';
import { collectJavaFindings } from '../../java-diff.mjs';
import {
  FULL_COVERAGE,
  HOOK_TIMEOUT_MS,
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
} from './integration-support.mjs';

const LAYER_TEST = 'src/integrationTest/java/demo/LayerArchTest.java';

describe.skipIf(!enabled)('an integration suite wired to check or left unwired', () => {
  const projectOf = useIntegrationProjects();
  const runs = {};
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
  }, HOOK_TIMEOUT_MS);
  beforeAll(() => {
    const project = projectOf(path.join(fixtures, 'integration-unwired'), { sources: true });
    moveIntegrationTest(project);
    runs.unwired = collectJavaFindings(project, { gradle, policy });
  }, HOOK_TIMEOUT_MS);

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
});
