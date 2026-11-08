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

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset library branches and ports end to end', () => {
  const fixture = useKotlinCoverageProject();
  it('passes a line whose only branches are inlined from the standard library and keeps a real branch beside one', () => {
    const result = diffOf(fixture.project, 'library-branches');
    const jacoco = result.newEnforceable.filter(({ tool }) => tool === 'jacoco');

    expect(
      jacoco
        .map(({ path: file, location }) => `${path.basename(file)}:${String(location.line)}`)
        .sort(),
    ).toEqual(['Library.kt:12', 'Library.kt:14', 'Library.kt:18']);
    expect(jacoco.find(({ location }) => location.line === 14).message).toBe(
      `Branch coverage is 50.00%; minimum is 95%. Not taken: a branch of this line or of isNullOrBlank, which is inlined from the standard library (pass null to take its null arm). Test it, or remove it if it can't happen. ${exceptionRoute({ rule: 'changed-branch-coverage', path: `${kotlinSources}/Library.kt`, function: 'Library.present' })}`,
    );
  });
  it('passes interfaces, a fun interface and exhaustive whens over a sealed interface and an enum', () => {
    const result = diffOf(fixture.project, 'ports');

    expect(fromTool(result.newEnforceable, 'jacoco')).toEqual([]);
  });
});
