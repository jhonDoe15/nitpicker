import { describe, expect, it } from 'vitest';
import { exceptionRoute } from '../../../../../shared/exceptions/rule-names.mjs';
import {
  diffOf,
  fromTool,
  kotlinE2eEnabled,
  kotlinSources,
} from '../test-support/kotlin-e2e-project.mjs';
import { useKotlinCoverageProject } from '../__tests__/kotlin-coverage-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset one-sided branch coverage end to end', () => {
  const fixture = useKotlinCoverageProject();
  it('fails a changed Kotlin branch that no test takes and only reports its mutants', () => {
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
        message: `Branch coverage is 50.00%; minimum is 95%. ${exceptionRoute({ rule: 'changed-branch-coverage', path: `${kotlinSources}/Label.kt`, function: 'Label.larger' })}`,
        location: { line: 4 },
      },
    ]);
    expect(fromTool(result.newEnforceable, 'pit')).toEqual([]);
    expect(
      result.newFindings.filter(
        ({ tool, rule, path: file }) =>
          tool === 'pit' && rule === 'mutant-survived' && file.endsWith('Label.kt'),
      ),
    ).not.toEqual([]);
  });
});
