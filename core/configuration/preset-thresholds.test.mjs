import { describe, expect, it } from 'vitest';
import { validateConfig } from './validate.mjs';

describe('preset thresholds', () => {
  it('takes the test time limit with every preset', () => {
    for (const preset of ['typescript', 'javascript', 'java', 'kotlin', 'python']) {
      const config = { preset, thresholds: { unitTestSeconds: 2, integrationTestSeconds: 20 } };

      expect(validateConfig(config)).toEqual(config);
    }
  });

  it('takes the test time and class limits with the python preset', () => {
    const config = { preset: 'python', thresholds: { unitTestSeconds: 2, classMethods: 30 } };

    expect(validateConfig(config)).toEqual(config);
  });
});
