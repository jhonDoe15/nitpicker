import { describe, expect, it } from 'vitest';
import { diffOf, fromTool, kotlinE2eEnabled } from '../__tests__/kotlin-e2e-project.mts';
import { useKotlinLintProject, BAD_DETEKT_FINDINGS } from '../__tests__/kotlin-lint-project.mts';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset detekt config left out end to end', () => {
  const fixture = useKotlinLintProject();
  it("leaves the project's detekt config out unless the project is listed", () => {
    const result = diffOf(fixture.project, 'detekt-config');

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_DETEKT_FINDINGS].sort());
  });
});
