import { expect, it } from 'vitest';
import { double } from '../src/main/math';

it('doubles', () => {
  expect(double(2)).toBe(4);
});
