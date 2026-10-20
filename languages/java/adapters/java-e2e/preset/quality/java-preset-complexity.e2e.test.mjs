import { describe, it, expect } from 'vitest';
import { repeated } from '../../test-support/java-preset-data.mjs';
import { GRADLE_STEP_TIMEOUT_MS, summarize } from '../../../test-support/gradle-e2e.mjs';
import { useJavaPresetProject, enabled } from '../../__tests__/java-preset-project.mjs';

describe.skipIf(!enabled)('Java preset end to end', () => {
  const fixture = useJavaPresetProject();
  it(
    'fails a new method over the CRAP limit',
    () => {
      const result = fixture.diffOf('complex');

      expect(result.failed).toBe(true);
      expect(summarize(result.newEnforceable)).toEqual([
        'crap crap-score-limit Complex.java',
        ...repeated(9, 'jacoco changed-branch-coverage Complex.java'),
        ...repeated(28, 'pit mutant-nocoverage Complex.java'),
        'structure function-statements-limit Complex.java', // the method has more than 15 statements
      ]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
  it(
    'scores a lambda by its synthetic method and an initializer block by its lines, each as a unit of its own',
    () => {
      const result = fixture.diffOf('units');
      const scored = result.newEnforceable.filter(({ tool }) => tool === 'crap');

      expect(scored.map(({ rule, symbol }) => `${rule} ${symbol}`).sort()).toEqual([
        'crap-score-limit Units.<init>',
        'crap-score-limit Units.total.<lambda>',
      ]);
      expect(result.newEnforceable.filter(({ tool }) => tool === 'structure')).toEqual([]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
