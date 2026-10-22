import { describe, it, expect, beforeAll } from 'vitest';
import { repeated } from '../../test-support/java-preset-data.mjs';
import { summarize } from '../../../test-support/gradle-e2e.mjs';
import {
  useJavaPresetProject,
  enabled,
  BASELINED_FINDINGS,
} from '../../__tests__/java-preset-project.mjs';

describe.skipIf(!enabled)('Java preset uncovered branches end to end', () => {
  const fixture = useJavaPresetProject();
  let edited;
  beforeAll(() => {
    edited = fixture.diffOf('branch-edited');
  }, 180_000);
  it('fails an uncovered branch on a changed line', () => {
    expect(edited.failed).toBe(true);
    expect(summarize(edited.newEnforceable)).toEqual([
      'jacoco changed-branch-coverage Branchy.java',
    ]);
  });
  it('names the method of an uncovered branch in the exception that accepts it', () => {
    expect(edited.newEnforceable.map(({ message }) => message)).toEqual([
      'Branch coverage is 0.00%; minimum is 95%. If this is intended, add {"rule":"changed-branch-coverage","paths":["src/main/java/demo/Branchy.java"],"function":"Branchy.larger","reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });
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
