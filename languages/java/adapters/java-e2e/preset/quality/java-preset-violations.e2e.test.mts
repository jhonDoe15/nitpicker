import { describe, it, expect } from 'vitest';
import { repeated } from '../../test-support/java-preset-data.mts';
import { summarize } from '../../../test-support/gradle-e2e.mts';
import {
  useJavaPresetProject,
  enabled,
  BASELINED_FINDINGS,
} from '../../__tests__/java-preset-project.mts';
import { helpUriProblems as helpUriProblemsUntyped } from '../../../../../../shared/reference/test-support/help-uris.mjs';
import type { JavaFinding } from '../../../typed/java-values.mts';
import { textOf } from '../../../../../../shared/values/readers.mts';

const helpUriProblems: (findings: readonly JavaFinding[]) => string[] = helpUriProblemsUntyped;

describe.skipIf(!enabled)('Java preset end to end', () => {
  const fixture = useJavaPresetProject();
  it('fails new Error Prone and formatter violations, and untested code, as new, each issue once', () => {
    const result = fixture.diffOf('violation');

    expect(result.failed).toBe(true);
    expect(summarize(result.newEnforceable)).toEqual([
      'errorprone DefaultCharset Bad.java',
      'errorprone EmptyCatch Bad.java',
      'google-java-format format Bad.java',
      'pit mutant-nocoverage Bad.java', // Bad.decode has no test
    ]);
    expect(helpUriProblems(result.newFindings)).toEqual([]);
    expect([...new Set(summarize(result.unchangedFindings))].sort()).toEqual(BASELINED_FINDINGS);
  }, 180_000);
  it('fails a new ArchUnit violation, once per rule and offending class', () => {
    const result = fixture.diffOf('architecture');

    expect(result.failed).toBe(true);
    expect(summarize(result.newEnforceable)).toEqual([
      ...repeated(2, 'archunit no_classes_use_legacy_date Stamp.java'),
      ...repeated(4, 'forbiddenapis legacy-date-time Stamp.java'),
      ...repeated(3, 'pit mutant-nocoverage Stamp.java'),
    ]);
    expect(helpUriProblems(result.newFindings)).toEqual([]);
    expect(
      result.newEnforceable
        .filter((finding) => finding.tool === 'archunit')
        .map((finding) => textOf(finding.identity))
        .sort((left, right) => left.localeCompare(right)),
    ).toEqual(['demo.Stamp', 'demo.Stamp$Inner']);
  }, 180_000);
});
