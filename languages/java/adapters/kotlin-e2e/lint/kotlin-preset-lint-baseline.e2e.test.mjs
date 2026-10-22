import { describe, expect, it } from 'vitest';
import {
  diffOf,
  fromTool,
  kotlinE2eEnabled,
  summarize,
} from '../test-support/kotlin-e2e-project.mjs';
import { useKotlinLintProject, LEGACY_FINDINGS } from '../__tests__/kotlin-lint-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset lint baseline end to end', () => {
  const fixture = useKotlinLintProject();
  it('passes a tested Kotlin change, keeps moved legacy findings baselined and ignores generated sources', () => {
    const result = diffOf(fixture.project, 'clean');

    expect(result.failed).toBe(false);
    expect(summarize(result.newEnforceable)).toEqual([]);
    expect(fromTool(result.newFindings, 'jacoco')).toEqual(['jacoco line-coverage Farewell.kt']);
    expect(fromTool(result.unchangedFindings, 'detekt')).toEqual(LEGACY_FINDINGS);
    expect(result.unchangedFindings.some(({ path: file }) => file.endsWith('Api.kt'))).toBe(false);
    expect(result.newFindings.some(({ path: file }) => file.endsWith('Api.kt'))).toBe(false);
  });
});
