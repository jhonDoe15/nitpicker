import { describe, expect, it } from 'vitest';
import { diffOf, fromTool, kotlinE2eEnabled } from '../../__tests__/kotlin-e2e-project.mts';
import { useKotlinLintProject, BAD_DETEKT_FINDINGS } from '../../__tests__/kotlin-lint-project.mts';
import { helpUriProblems } from '../../../../../../shared/reference/test-support/help-uris.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset without a formatter end to end', () => {
  const fixture = useKotlinLintProject();
  it('runs no format check for a project that names no formatter', () => {
    const result = diffOf(fixture.project, 'no-formatter');

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_DETEKT_FINDINGS].sort());
    expect(helpUriProblems(result.newFindings)).toEqual([]);
    expect(result.newFindings.filter(({ tool }) => ['ktlint', 'ktfmt'].includes(tool))).toEqual([]);
  });
});
