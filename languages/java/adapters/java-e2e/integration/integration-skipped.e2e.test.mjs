import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import {
  FULL_COVERAGE,
  HOOK_TIMEOUT_MS,
  WITHOUT_FAREWELL,
  coverage,
  enabled,
  fixtures,
  gradle,
  mutations,
  policy,
  slowTests,
  useIntegrationProjects,
} from './integration-support.mjs';

describe.skipIf(!enabled)('a skipped integration task', () => {
  const projectOf = useIntegrationProjects();
  const runs = {};
  beforeAll(() => {
    const project = projectOf(path.join(fixtures, 'integration-skippable'), { sources: true });
    runs.beforeSkip = collectJavaFindings(project, { gradle, policy });
    writeFileSync(path.join(project, 'skip-integration-tests'), '');
    runs.afterSkip = collectJavaFindings(project, { gradle, policy });
  }, HOOK_TIMEOUT_MS);

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
});
