import { describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../test-support/views/kotlin-e2e-views.mts';
import {
  diffOf,
  fromTool,
  git,
  gradle,
  kotlinE2eEnabled,
  kotlinPolicy,
  ktlintRules,
} from '../__tests__/kotlin-e2e-project.mts';
import {
  useKotlinLintProject,
  BAD_DETEKT_FINDINGS,
  BAD_KTLINT_RULES,
  LEGACY_FINDINGS,
} from '../__tests__/kotlin-lint-project.mts';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset detekt, ktlint and ktfmt end to end', () => {
  const fixture = useKotlinLintProject();
  it('detects ktfmt from the build files when the project names it', () => {
    git(fixture.project, 'checkout', '-q', 'ktfmt-named');
    const findings = collectJavaFindings(fixture.project.root, { gradle, policy: kotlinPolicy });
    const formatters = new Set(
      findings.filter(({ rule }) => rule === 'format').map(({ tool }) => tool),
    );

    expect(formatters.has('ktfmt')).toBe(true);
    expect(formatters.has('ktlint')).toBe(false);
  });
  it('gates a Kotlin-only module, where the Java tools have nothing to analyze', () => {
    const result = diffOf(fixture.kotlinOnlyProject, 'kotlin-only-violation');

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_DETEKT_FINDINGS].sort());
    expect(ktlintRules(result.newEnforceable)).toEqual(BAD_KTLINT_RULES);
    expect(fromTool(result.unchangedFindings, 'detekt')).toEqual(LEGACY_FINDINGS);
    expect(result.newEnforceable.filter(({ tool }) => ['pmd', 'spotbugs'].includes(tool))).toEqual(
      [],
    );
  });
});
