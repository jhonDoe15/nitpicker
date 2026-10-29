import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exceptionRoute } from '../../../../../shared/exceptions/rule-names.mjs';
import {
  diffOf,
  fromTool,
  kotlinE2eEnabled,
  kotlinSources,
} from '../test-support/kotlin-e2e-project.mjs';
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
  it('passes a line whose only branches are inlined from the standard library and keeps a real branch beside one', () => {
    const result = diffOf(fixture.project, 'library-branches');
    const jacoco = result.newEnforceable.filter(({ tool }) => tool === 'jacoco');

    expect(
      jacoco
        .map(({ path: file, location }) => `${path.basename(file)}:${String(location.line)}`)
        .sort(),
    ).toEqual(['Library.kt:12', 'Library.kt:14', 'Library.kt:18']);
    expect(jacoco.find(({ location }) => location.line === 14).message).toContain(
      'Not taken: a branch of this line or of isNullOrBlank, which is inlined from the standard library (pass null to take its null arm).',
    );
  });
  it('passes interfaces, a fun interface and exhaustive whens over a sealed interface and an enum', () => {
    const result = diffOf(fixture.project, 'ports');

    expect(fromTool(result.newEnforceable, 'jacoco')).toEqual([]);
  });
});
