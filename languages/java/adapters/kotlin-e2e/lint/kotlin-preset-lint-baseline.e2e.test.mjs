import { describe, expect, it } from 'vitest';
import {
  diffOf,
  fromTool,
  kotlinE2eEnabled,
  ktlintOf,
  ktlintRules,
  summarize,
} from '../test-support/kotlin-e2e-project.mjs';
import {
  useKotlinLintProject,
  BAD_DETEKT_FINDINGS,
  BAD_BRANCH_FINDINGS,
  BAD_KTLINT_RULES,
  LEGACY_FINDINGS,
} from '../__tests__/kotlin-lint-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset detekt, ktlint and ktfmt end to end', () => {
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
  it('fails new detekt and ktlint findings (ktlint detected from .editorconfig) in Kotlin code', () => {
    const result = diffOf(fixture.project, 'violation');

    expect(result.failed).toBe(true);
    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_DETEKT_FINDINGS].sort());
    expect(fromTool(result.newEnforceable, 'jacoco')).toEqual(BAD_BRANCH_FINDINGS);
    expect(ktlintRules(result.newEnforceable)).toEqual(BAD_KTLINT_RULES);
    expect(fromTool(result.unchangedFindings, 'detekt')).toEqual(LEGACY_FINDINGS);
    expect(fromTool(result.unchangedFindings, 'ktlint')).toEqual([]);
    expect(Math.min(...ktlintOf(result.newEnforceable).map(({ location }) => location.line))).toBe(
      3,
    );
  });
});
