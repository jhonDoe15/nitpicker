import { describe, it, expect } from 'vitest';
import { repeated } from '../../test-support/java-preset-data.mjs';
import { summarize } from '../../../test-support/gradle-e2e.mjs';
import {
  useJavaPresetProject,
  enabled,
  BASELINED_FINDINGS,
} from '../../__tests__/java-preset-project.mjs';

function branchException(functionName) {
  return {
    rule: 'changed-branch-coverage',
    paths: ['src/main/java/demo/Branchy.java'],
    function: functionName,
  };
}

describe.skipIf(!enabled)('Java preset end to end', () => {
  const fixture = useJavaPresetProject();
  it('fails an uncovered branch on a changed line', () => {
    const result = fixture.diffOf('branch-edited');

    expect(result.failed).toBe(true);
    expect(summarize(result.newEnforceable)).toEqual([
      'jacoco changed-branch-coverage Branchy.java',
    ]);
  }, 180_000);
  it('names the method of an uncovered branch in the exception that accepts it', () => {
    const result = fixture.diffOf('branch-edited');

    expect(result.newEnforceable.map(({ message }) => message)).toEqual([
      'Branch coverage is 0.00%; minimum is 95%. Add a test for each outcome it misses. If this is intended, add {"rule":"changed-branch-coverage","paths":["src/main/java/demo/Branchy.java"],"function":"Branchy.larger","reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  }, 180_000);
  it('accepts an uncovered branch with an exception that names its method', () => {
    const result = fixture.diffOf('branch-edited', {
      exceptions: [branchException('Branchy.larger')],
    });

    expect(result.failed).toBe(false);
    expect(summarize(result.newEnforceable)).toEqual([]);
  }, 180_000);
  it('keeps failing when the exception names another method', () => {
    const result = fixture.diffOf('branch-edited', {
      exceptions: [branchException('Branchy.smaller')],
    });

    expect(result.failed).toBe(true);
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
