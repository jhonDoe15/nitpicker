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
    expect(
      [...result.unchangedFindings, ...result.newFindings]
        .map(({ path: file }) => file)
        .filter((file, index, files) => files.indexOf(file) === index)
        .sort(),
    ).toEqual([
      '.',
      'build.gradle.kts',
      'src/main/java/demo/Api.java',
      'src/main/java/demo/Bridge.java',
      'src/main/kotlin/demo/Farewell.kt',
      'src/main/kotlin/demo/Greeter.kt',
      'src/main/kotlin/demo/Legacy.kt',
    ]);
  });
});
