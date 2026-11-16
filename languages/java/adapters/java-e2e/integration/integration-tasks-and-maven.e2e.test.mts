import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mts';
import type { JavaFinding } from '../../typed/java-values.mts';
import { type Runs, ranOf } from '../test-support/views/runs.mts';
import {
  FULL_COVERAGE,
  comparable,
  coverage,
  enabled,
  failsafeFixture,
  fixtures,
  gradle,
  maven,
  mutations,
  policy,
  slowTests,
  useIntegrationProjects,
} from '../__tests__/integration-support.mts';

describe.skipIf(!enabled)('integration tests wired to check on Gradle and Maven', () => {
  const projectOf = useIntegrationProjects();
  const runs: Runs<'maven' | 'tasks', readonly JavaFinding[]> = {};
  beforeAll(() => {
    runs.tasks = collectJavaFindings(
      projectOf(path.join(fixtures, 'integration-tasks'), { sources: true }),
      { gradle, policy },
    );
  }, 180_000);
  beforeAll(() => {
    runs.maven = collectJavaFindings(projectOf(failsafeFixture), { maven, policy });
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
});
