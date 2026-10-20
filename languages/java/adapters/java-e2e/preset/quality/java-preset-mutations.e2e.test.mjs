import { describe, it, expect } from 'vitest';
import { GRADLE_STEP_TIMEOUT_MS, summarize } from '../../../test-support/gradle-e2e.mjs';
import {
  useJavaPresetProject,
  enabled,
  BASELINED_FINDINGS,
} from '../../__tests__/java-preset-project.mjs';

describe.skipIf(!enabled)('Java preset end to end', () => {
  const fixture = useJavaPresetProject();
  it(
    'fails a new surviving mutant in changed code',
    () => {
      const survivor = fixture.diffOf('survivor');

      expect(survivor.failed).toBe(true);
      expect(summarize(survivor.newEnforceable)).toEqual([
        'coupling test-only-export Calc.java',
        'pit mutant-survived Calc.java',
      ]);
      expect(survivor.newEnforceable.find((finding) => finding.tool === 'pit').message).toEqual(
        'Survived ConditionalsBoundaryMutator: changed conditional boundary: no test fails when this code changes. Add an assertion that would. If no input can tell the two apart (a compareTo boundary, a discarded lambda return), simplify the code so this mutant disappears, or add an exception for pit/mutant-survived in nitpicker.config.json.',
      );
      // The legacy uncovered mutants (Greeter.shout, Legacy.value) stay baselined.
      expect([...new Set(summarize(survivor.unchangedFindings))].sort()).toEqual(
        BASELINED_FINDINGS,
      );
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
  it(
    'baselines an uncovered branch whose line only moves',
    () => {
      const result = fixture.diffOf('branch-moved');

      expect(result.failed).toBe(false);
      expect(summarize(result.newEnforceable)).toEqual([]);
      expect([...new Set(summarize(result.unchangedFindings))].sort()).toEqual(BASELINED_FINDINGS);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
