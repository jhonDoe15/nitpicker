import { describe, it, expect } from 'vitest';
import { summarize } from '../../../test-support/gradle-e2e.mjs';
import { useJavaPresetProject, enabled } from '../../__tests__/java-preset-project.mjs';

function branchException(functionName) {
  return {
    rule: 'changed-branch-coverage',
    paths: ['src/main/java/demo/Branchy.java'],
    function: functionName,
  };
}

describe.skipIf(!enabled)('Java preset branch coverage exceptions end to end', () => {
  const fixture = useJavaPresetProject();
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
});
