import { describe, expect, it } from 'vitest';
import {
  diffOf,
  fromTool,
  kotlinE2eEnabled,
  kotlinSources,
} from '../__tests__/kotlin-e2e-project.mts';
import { useKotlinCoverageProject } from '../__tests__/kotlin-coverage-project.mts';
import { exceptionRoute } from '../test-support/views/kotlin-e2e-views.mts';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset one-sided branch coverage end to end', () => {
  const fixture = useKotlinCoverageProject();
  it('fails a changed Kotlin branch that no test takes together with its surviving mutants', () => {
    const result = diffOf(fixture.project, 'one-sided-branch');

    expect(result.failed).toBe(true);
    expect(fromTool(result.newEnforceable, 'jacoco')).toEqual([
      'jacoco changed-branch-coverage Label.kt',
    ]);
    expect(
      result.newEnforceable
        .filter(({ tool }) => tool === 'jacoco')
        .map(({ message, location }) => ({ message, location })),
    ).toEqual([
      {
        message: `Branch coverage is 50.00%; minimum is 95%. Add a test for each outcome it misses. ${exceptionRoute({ rule: 'changed-branch-coverage', path: `${kotlinSources}/Label.kt`, function: 'Label.larger' })}`,
        location: { line: 4 },
      },
    ]);
    expect(fromTool(result.newEnforceable, 'pit')).toEqual([
      'pit mutant-survived Label.kt',
      'pit mutant-survived Label.kt',
    ]);
  });
});
