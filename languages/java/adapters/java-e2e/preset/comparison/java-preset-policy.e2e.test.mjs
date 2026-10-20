import { describe, it, expect } from 'vitest';
import { GRADLE_STEP_TIMEOUT_MS, summarize } from '../../../test-support/gradle-e2e.mjs';
import {
  useJavaPresetProject,
  enabled,
  sourceDirectory,
} from '../../__tests__/java-preset-project.mjs';

describe.skipIf(!enabled)('Java preset end to end', () => {
  const fixture = useJavaPresetProject();
  it(
    'honours thresholds.crapLimit: a high limit lets the complex method pass the CRAP rule',
    () => {
      const result = fixture.diffOf('complex', { crapLimit: 1_000_000 });

      expect(summarize(result.newEnforceable)).not.toContain('crap crap-score-limit Complex.java');
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
  it(
    'honours exclude: findings under an excluded path are dropped',
    () => {
      const result = fixture.diffOf('violation', { exclude: [`${sourceDirectory}/Bad.java`] });

      expect(result.failed).toBe(false);
      expect(result.newFindings.some((finding) => finding.path.endsWith('Bad.java'))).toBe(false);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
