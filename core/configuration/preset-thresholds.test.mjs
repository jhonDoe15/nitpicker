import { describe, expect, it } from 'vitest';
import { validateConfig } from './validate.mjs';

describe('preset thresholds', () => {
  it('takes the test time limit only where a preset reads test times', () => {
    expect(() =>
      validateConfig({ preset: 'typescript', thresholds: { unitTestSeconds: 2 } }),
    ).toThrow(
      '"thresholds.unitTestSeconds" is supported only with "preset": "java", "kotlin" or "python"',
    );
  });

  it('takes the test time and class limits with the python preset', () => {
    const config = { preset: 'python', thresholds: { unitTestSeconds: 2, classMethods: 30 } };

    expect(validateConfig(config)).toEqual(config);
  });
});
