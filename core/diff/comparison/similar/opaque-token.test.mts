import { describe, expect, it } from 'vitest';
import { isOpaqueChange } from './opaque-token.mjs';

describe('a changed word that looks like a random value', () => {
  it.each([
    ['kqzmwa', 'xvbnrt'],
    ["'kqzmwa',", "'xvbnrt',"],
    ['kqzmwa', 'render'],
    ['a3f9c', 'b4e1d'],
    ['<id>', 'kqzmwa'],
    ['<id>', 'render'],
    ['<n>', '<id>'],
    ['<n>f9ca', 'b3d1e'],
    ['<n>', '<n>f9ca'],
  ])('tolerates %j for %j', (left, right) => {
    expect(isOpaqueChange(left, right)).toBe(true);
  });

  it.each([
    ['`List`.', '`Table`.'],
    ['"key"', '"ref"'],
    ['element', 'component'],
    ['render', 'create'],
    ['fooBar', 'bazQux'],
    ['onFoo', 'onBar'],
    ['`fooBar`', '`bazQux`'],
    ["'ECONNREFUSED',", "'ENOTFOUND',"],
    ['Table', 'xvbnrt'],
    ['`kqzmwa`', '`xvbnrt`'],
    ['abc', 'xyz'],
    ['<n>', 'render'],
  ])('keeps %j and %j apart', (left, right) => {
    expect(isOpaqueChange(left, right)).toBe(false);
  });
});
