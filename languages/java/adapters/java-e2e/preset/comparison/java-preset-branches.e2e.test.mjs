import { describe, it, expect } from 'vitest';
import { repeated } from '../../test-support/java-preset-data.mjs';
import { summarize } from '../../../test-support/gradle-e2e.mjs';
import {
  useJavaPresetProject,
  enabled,
  BASELINED_FINDINGS,
} from '../../__tests__/java-preset-project.mjs';

describe.skipIf(!enabled)('Java preset end to end', () => {
  const fixture = useJavaPresetProject();
  it('fails an uncovered branch on a changed line', () => {
    const result = fixture.diffOf('branch-edited');

    expect(result.failed).toBe(true);
    expect(summarize(result.newEnforceable)).toEqual([
      'jacoco changed-branch-coverage Branchy.java',
    ]);
  }, 180_000);
  it('fails a new uncovered branch and keeps the old one baselined', () => {
    const result = fixture.diffOf('branch-added');

    expect(result.failed).toBe(true);
    expect(summarize(result.newEnforceable)).toEqual([
      'jacoco changed-branch-coverage Branchy.java',
      ...repeated(4, 'pit mutant-nocoverage Branchy.java'),
    ]);
    expect([...new Set(summarize(result.unchangedFindings))].sort()).toEqual(BASELINED_FINDINGS);
  }, 180_000);
});
