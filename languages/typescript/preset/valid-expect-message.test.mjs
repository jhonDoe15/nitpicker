import vitest from '@vitest/eslint-plugin';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import presetConfig from './defaults/eslint.config.mjs';

const configured = presetConfig.findLast(
  (entry) => entry.rules?.['vitest/valid-expect'] !== undefined,
).rules['vitest/valid-expect'];

function validExpectMessages(code) {
  return new Linter().verify(code, [
    { plugins: { vitest }, rules: { 'vitest/valid-expect': configured } },
  ]);
}

describe('vitest/valid-expect', () => {
  it('accepts a message argument', () => {
    expect(validExpectMessages("expect(1, 'why').toBe(1);\n")).toEqual([]);
  });

  it('rejects a third argument', () => {
    expect(validExpectMessages("expect(1, 'why', 3).toBe(1);\n")).toHaveLength(1);
  });
});
