import { describe, expect, it } from 'vitest';
import { validateConfig } from './validate.mjs';

describe('preset thresholds', () => {
  it.each(['typescript', 'javascript', 'java', 'kotlin', 'python'])(
    'takes both test time limits with the %s preset',
    (preset) => {
      const config = { preset, thresholds: { unitTestSeconds: 2, integrationTestSeconds: 20 } };
      expect(validateConfig(config)).toEqual(config);
    },
  );

  it('takes the test time and class limits with the python preset', () => {
    const config = { preset: 'python', thresholds: { unitTestSeconds: 2, classMethods: 30 } };

    expect(validateConfig(config)).toEqual(config);
  });
});
