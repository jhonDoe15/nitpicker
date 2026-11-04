import { describe, expect, it } from 'vitest';
import {
  enabled,
  ofTool,
  useEscapeHatchProject,
} from '../java-e2e/__tests__/escape-hatches-project.mjs';

describe.skipIf(!enabled)('Java preset Checkstyle escape hatch', () => {
  const project = useEscapeHatchProject();

  it("lays the project's Checkstyle config over nitpicker's when tools.checkstyle opts in", () => {
    const result = project.diffOf({
      policyRoot: project.repository,
      toolPrecedence: { checkstyle: ['project'] },
    });

    expect(ofTool(result, 'checkstyle')).toEqual(['checkstyle FinalParameters Bad.java']);
  }, 180_000);
});
