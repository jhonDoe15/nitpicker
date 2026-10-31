import { describe, expect, it } from 'vitest';
import {
  enabled,
  ofTool,
  useEscapeHatchProject,
} from '../java-e2e/__tests__/escape-hatches-project.mjs';

describe.skipIf(!enabled)('Java preset PMD escape hatch', () => {
  const project = useEscapeHatchProject();

  it("adds the project's PMD rules to nitpicker's when tools.pmd opts in", () => {
    const result = project.diffOf({
      policyRoot: project.repository,
      toolPrecedence: { pmd: ['project'] },
    });

    expect(ofTool(result, 'pmd')).toEqual([
      'pmd AvoidCatchingGenericException SwallowingTest.java',
      'pmd MethodArgumentCouldBeFinal Bad.java',
      'pmd UnitTestShouldIncludeAssert SwallowingTest.java',
    ]);
  }, 180_000);
});
