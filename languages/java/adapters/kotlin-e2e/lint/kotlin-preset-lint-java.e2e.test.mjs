import { describe, expect, it } from 'vitest';
import { diffOf, fromTool, kotlinE2eEnabled } from '../test-support/kotlin-e2e-project.mjs';
import { useKotlinLintProject } from '../__tests__/kotlin-lint-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset detekt, ktlint and ktfmt end to end', () => {
  const fixture = useKotlinLintProject();
  it('still gates Java sources of a Kotlin module with the Java tools', () => {
    const result = diffOf(fixture.project, 'java-in-kotlin-module');

    expect(result.failed).toBe(true);
    expect(fromTool(result.newEnforceable, 'errorprone')).toEqual([
      'errorprone EmptyCatch Danger.java',
    ]);
    expect(fromTool(result.newEnforceable, 'pmd')).toEqual([]);
    expect(
      result.newEnforceable.filter((finding) =>
        ['detekt', 'ktlint', 'ktfmt'].includes(finding.tool),
      ),
    ).toEqual([]);
  });
  it('checks the Java files of a Kotlin module with palantir-java-format when the project declares it', () => {
    const conventions = { 'java.formatter': 'palantir', 'java.indentation': '4' };
    const result = diffOf(fixture.project, 'java-palantir', {
      policy: { preset: 'kotlin', javaStyle: 'palantir', conventions },
    });

    expect(fromTool(result.newEnforceable, 'palantir-java-format')).toEqual([
      'palantir-java-format format Danger.java',
    ]);
    expect(
      [...result.newFindings, ...result.unchangedFindings].filter(
        ({ tool }) => tool === 'google-java-format',
      ),
    ).toEqual([]);
  });
});
