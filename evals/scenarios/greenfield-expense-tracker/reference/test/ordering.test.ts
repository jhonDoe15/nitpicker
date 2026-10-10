import { describe, expect, it } from 'vitest';
import { compareText, sorted } from '../src/main/shared/ordering.js';

describe('compareText', () => {
  it('orders by character code', () => {
    expect(compareText('a', 'b')).toBe(-1);
    expect(compareText('b', 'a')).toBe(1);
    expect(compareText('a', 'a')).toBe(0);
    expect(compareText('Zed', 'apple')).toBe(-1);
  });
});

describe('sorted', () => {
  it('returns a new array and leaves the input alone', () => {
    const input = [3, 1, 2];
    expect(sorted(input, (left, right) => left - right)).toEqual([1, 2, 3]);
    expect(input).toEqual([3, 1, 2]);
  });
});
