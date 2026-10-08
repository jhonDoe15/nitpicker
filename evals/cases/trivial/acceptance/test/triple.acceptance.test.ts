import { expect, it } from 'vitest';
import { triple } from '../src/main/math';

it('triples', () => {
  expect(triple(3)).toBe(9);
  expect(triple(-2)).toBe(-6);
});
