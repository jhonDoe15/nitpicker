import { describe, expect, it } from 'vitest';
import { isNearCopy } from './token-similarity.mjs';

function tokens(count, prefix = 't') {
  return Array.from({ length: count }, (_, index) => `${prefix}${String(index)}`);
}

describe('isNearCopy', () => {
  it('accepts sequences that differ and share at least the minimum of their tokens', () => {
    const left = tokens(10);

    expect(isNearCopy(left, left.with(4, 'x'), 0.8)).toBe(true);
    expect(isNearCopy(left, left.with(4, 'x').with(5, 'y'), 0.8)).toBe(true);
    expect(isNearCopy(left, left.with(4, 'x').with(5, 'y').with(6, 'z'), 0.8)).toBe(false);
  });

  it('rejects identical sequences and empty ones', () => {
    expect(isNearCopy(tokens(10), tokens(10), 0.8)).toBe(false);
    expect(isNearCopy([], [], 0.8)).toBe(false);
  });

  it('counts an inserted or removed run of tokens by the tokens it adds', () => {
    const left = tokens(20);
    const inserted = [...left.slice(0, 7), 'a', 'b', ...left.slice(7)];

    expect(isNearCopy(left, inserted, 0.8)).toBe(true);
    expect(isNearCopy(inserted, left, 0.8)).toBe(true);
    expect(isNearCopy(left, [...left.slice(0, 4), ...left.slice(12)], 0.8)).toBe(false);
  });

  it('measures the tokens in common in order, not as a bag', () => {
    const left = tokens(10);

    expect(isNearCopy(left, left.toReversed(), 0.8)).toBe(false);
    expect(isNearCopy(left, [...left.slice(5), ...left.slice(0, 5)], 0.8)).toBe(false);
  });

  it('rejects a pair whose sizes alone rule out the minimum', () => {
    expect(isNearCopy(tokens(10), tokens(20), 0.8)).toBe(false);
    expect(isNearCopy(tokens(20), tokens(10), 0.8)).toBe(false);
  });

  it('is symmetric and compares a shared prefix and suffix around a changed middle', () => {
    const left = [...tokens(30), 'a', 'b', 'c', ...tokens(30, 's')];
    const right = [...tokens(30), 'x', 'b', 'y', ...tokens(30, 's')];

    expect(isNearCopy(left, right, 0.8)).toBe(true);
    expect(isNearCopy(right, left, 0.8)).toBe(true);
    expect(isNearCopy(left, right, 0.99)).toBe(false);
  });
});
