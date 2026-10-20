import { describe, it, expect } from 'vitest';
import { GRADLE_STEP_TIMEOUT_MS, summarize } from '../../../test-support/gradle-e2e.mjs';
import {
  useJavaPresetProject,
  enabled,
  BASELINED_FINDINGS,
  BASELINED_FINDINGS_WITHOUT_GREETER_LINE_COVERAGE,
} from '../../__tests__/java-preset-project.mjs';

describe.skipIf(!enabled)('Java preset end to end', () => {
  const fixture = useJavaPresetProject();
  it(
    'passes a clean change and reports the baselined legacy violations as unchanged',
    () => {
      const result = fixture.diffOf('clean');

      expect(result.failed).toBe(false);
      expect(summarize(result.newEnforceable)).toEqual([]);
      expect([...new Set(summarize(result.unchangedFindings))].sort()).toEqual(
        BASELINED_FINDINGS_WITHOUT_GREETER_LINE_COVERAGE,
      );
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
  it(
    'keeps a violation baselined when its line moves',
    () => {
      const result = fixture.diffOf('moved');

      expect(result.failed).toBe(false);
      expect(summarize(result.newFindings.filter((finding) => finding.tool !== 'jacoco'))).toEqual(
        [],
      );
      expect([...new Set(summarize(result.unchangedFindings))].sort()).toEqual(BASELINED_FINDINGS);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
