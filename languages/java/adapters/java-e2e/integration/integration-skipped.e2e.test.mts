import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
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
  mutations,
  policy,
  slowTests,
  useIntegrationProjects,
} from '../__tests__/integration-support.mts';

describe.skipIf(!enabled)('a skipped integration task', () => {
  const projectOf = useIntegrationProjects();
  const runs: Runs<'afterSkip' | 'beforeSkip', readonly JavaFinding[]> = {};
  beforeAll(() => {
    const project = projectOf(path.join(fixtures, 'integration-skippable'), { sources: true });
    runs.beforeSkip = collectJavaFindings(project, { gradle, policy });
    writeFileSync(path.join(project, 'skip-integration-tests'), '');
    runs.afterSkip = collectJavaFindings(project, { gradle, policy });
  }, 180_000);

  it('count a skipped integration task nowhere, not even from its earlier run', () => {
    expect(coverage(ranOf(runs, 'beforeSkip'))).toEqual(FULL_COVERAGE);
    expect(coverage(ranOf(runs, 'afterSkip'))).toEqual(WITHOUT_FAREWELL);
    expect(slowTests(ranOf(runs, 'afterSkip'))).toEqual([]);
    expect(mutations(ranOf(runs, 'afterSkip'))).toEqual([
      'mutant-nocoverage Greeter|farewell(LString;)LString;|EmptyObjectReturnValsMutator|replaced return value with "" for Greeter::farewell#1',
      'mutation-summary status:NoCoverage',
      'mutation-summary status:Killed',
    ]);
  });
});
