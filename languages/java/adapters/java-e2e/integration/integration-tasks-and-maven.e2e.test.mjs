import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import {
  FULL_COVERAGE,
  HOOK_TIMEOUT_MS,
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
} from './integration-support.mjs';

describe.skipIf(!enabled)('integration tests wired to check on Gradle and Maven', () => {
  const projectOf = useIntegrationProjects();
  const runs = {};
  beforeAll(() => {
    runs.tasks = collectJavaFindings(
      projectOf(path.join(fixtures, 'integration-tasks'), { sources: true }),
      { gradle, policy },
    );
  }, HOOK_TIMEOUT_MS);
  beforeAll(() => {
    runs.maven = collectJavaFindings(projectOf(failsafeFixture), { maven, policy });
  }, HOOK_TIMEOUT_MS);

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
});
