import { describe, expect, it } from 'vitest';
import {
  diffOf,
  git,
  gradle,
  kotlinE2eEnabled,
  kotlinPolicy,
  kotlinSources,
} from '../__tests__/kotlin-e2e-project.mts';
import { useKotlinCoverageProject } from '../__tests__/kotlin-coverage-project.mts';
import { analyzeJavaSnapshot } from '../test-support/views/kotlin-e2e-views.mts';
import {
  structureChangeChecks,
  testOnlyFacadeChecks,
} from './__tests__/kotlin-coverage-expectations.mts';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset coverage and structure end to end', () => {
  const fixture = useKotlinCoverageProject();
  it('applies the structure, CRAP, clone and stability rules to one change', () => {
    const result = diffOf(fixture.project, 'head', { base: 'structure-base' });
    const comparison = structureChangeChecks(result);

    expect(comparison.actual).toEqual(comparison.expected);
  });
  it('reports a Kotlin file facade only tests use and spares a file with a main function', () => {
    const result = diffOf(fixture.project, 'test-only');

    const comparison = testOnlyFacadeChecks(result);

    expect(comparison.actual).toEqual(comparison.expected);
  });
  it('reports a Gradle compile failure as compile-error findings at the broken file', () => {
    git(fixture.project, 'checkout', '-q', 'broken');

    const { findings } = analyzeJavaSnapshot(fixture.project.root, {
      gradle,
      policy: kotlinPolicy,
    });

    expect([
      ...new Set(
        findings.map(
          ({ tool, rule, classification, path: file }) =>
            `${tool}/${rule} ${classification} ${file}`,
        ),
      ),
    ]).toEqual([
      `build/compile-error enforceable ${kotlinSources}/Broken.kt`,
      'kotlin/compile-failed-skipped tool-error .',
    ]);
  });
});
