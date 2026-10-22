import { describe, expect, it } from 'vitest';
import {
  diffOf,
  fromTool,
  kotlinE2eEnabled,
  summarize,
} from '../../test-support/kotlin-e2e-project.mjs';
import { useKotlinLintProject, BAD_FINDINGS } from '../../__tests__/kotlin-lint-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset ktfmt end to end', () => {
  const fixture = useKotlinLintProject();
  it('checks formatting with ktfmt when configured, accepting code in its style', () => {
    const result = diffOf(fixture.project, 'ktfmt', {
      policy: { preset: 'kotlin', kotlinFormatter: 'ktfmt' },
    });

    expect(summarize(result.newEnforceable)).toEqual(
      [...BAD_FINDINGS, 'ktfmt format Bad.kt'].sort(),
    );
    expect(fromTool(result.unchangedFindings, 'ktfmt')).toEqual(
      ['Greeter', 'GreeterTest', 'Legacy'].map((name) => `ktfmt format ${name}.kt`),
    );
  });
});
