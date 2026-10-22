import { describe, expect, it } from 'vitest';
import {
  diffOf,
  fromTool,
  kotlinE2eEnabled,
  kotlinPolicyWithProjectDetekt,
  ktlintRules,
} from '../test-support/kotlin-e2e-project.mjs';
import {
  useKotlinLintProject,
  BAD_DETEKT_FINDINGS,
  BAD_BRANCH_FINDINGS,
  BAD_KTLINT_RULES,
} from '../__tests__/kotlin-lint-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset detekt, ktlint and ktfmt end to end', () => {
  const fixture = useKotlinLintProject();
  it("leaves the project's detekt config out unless the project is listed", () => {
    const result = diffOf(fixture.project, 'detekt-config');

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_DETEKT_FINDINGS].sort());
  });
  it("runs detekt with the project's config laid over the defaults when the project is listed", () => {
    const result = diffOf(fixture.project, 'detekt-config', {
      policy: kotlinPolicyWithProjectDetekt,
    });

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([
      'detekt detekt.style.UnusedPrivateProperty Bad.kt',
    ]);
    expect(fromTool(result.newEnforceable, 'jacoco')).toEqual(BAD_BRANCH_FINDINGS);
    expect(ktlintRules(result.newEnforceable)).toEqual(BAD_KTLINT_RULES);
  });
});
