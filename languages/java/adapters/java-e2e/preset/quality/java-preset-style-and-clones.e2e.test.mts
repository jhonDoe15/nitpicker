import { describe, it, expect } from 'vitest';
import { summarize } from '../../../test-support/gradle-e2e.mts';
import { useJavaPresetProject, enabled } from '../../__tests__/java-preset-project.mts';
import { helpUriProblems as helpUriProblemsUntyped } from '../../../../../../shared/reference/test-support/help-uris.mjs';
import type { JavaFinding } from '../../../typed/java-values.mts';

const helpUriProblems: (findings: readonly JavaFinding[]) => string[] = helpUriProblemsUntyped;

describe.skipIf(!enabled)('Java preset end to end', () => {
  const fixture = useJavaPresetProject();
  it('with palantir declared, fails a new badly formatted file and lets a 108-column line pass', () => {
    const conventions = {
      'java.formatter': 'palantir',
      'java.indentation': '4',
      'java.lineLength': '120',
    };
    const result = fixture.diffOf('palantir', { javaStyle: 'palantir', conventions });
    function style(findings: readonly JavaFinding[]): string[] {
      return summarize(
        findings.filter(
          ({ tool, rule }) => tool === 'palantir-java-format' || rule === 'line-length-limit',
        ),
      );
    }

    expect(style(result.newEnforceable)).toEqual(['palantir-java-format format Messy.java']);
    expect(style(result.newFindings)).toEqual(['palantir-java-format format Messy.java']);
    expect(helpUriProblems(result.newFindings)).toEqual([]);
  }, 180_000);
  it('fails a new clone between two files, and the repeated blocks PMD CPD finds inside each copy', () => {
    const result = fixture.diffOf('clone');

    expect(result.failed).toBe(true);
    expect(
      summarize(result.newEnforceable.filter((finding) => finding.tool === 'duplicates')),
    ).toEqual([
      'duplicates duplicate-clone Left.java',
      'duplicates duplicate-clone Left.java',
      'duplicates duplicate-clone Right.java',
    ]);
  }, 180_000);
});
