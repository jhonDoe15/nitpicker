import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { diffOf, fromTool, kotlinE2eEnabled } from '../test-support/kotlin-e2e-project.mjs';
import { useKotlinCoverageProject } from '../__tests__/kotlin-coverage-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset coverage and structure end to end', () => {
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
    ).toEqual([{ message: 'Branch coverage is 50.00%; minimum is 95%', location: { line: 4 } }]);
    expect(fromTool(result.newEnforceable, 'pit')).toEqual([]);
    expect(
      result.newFindings.filter(
        ({ tool, rule, path: file }) =>
          tool === 'pit' && rule === 'mutant-survived' && file.endsWith('Label.kt'),
      ),
    ).not.toEqual([]);
  });
  it('fails the untested branches of a statement that spans lines and of a file outside its package directory', () => {
    const result = diffOf(fixture.project, 'multiline-branch');

    expect(result.failed).toBe(true);
    expect(
      result.newEnforceable
        .filter(({ tool }) => tool === 'jacoco')
        .map(({ path: file, location }) => `${path.basename(file)}:${String(location.line)}`)
        .sort(),
    ).toEqual(['Offset.kt:4', 'Spread.kt:10', 'Spread.kt:7']);
  });
});
