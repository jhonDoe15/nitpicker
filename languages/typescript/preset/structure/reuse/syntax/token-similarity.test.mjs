import { describe, expect, it } from 'vitest';
import { createSimilarityCache, tokenSimilarity } from './token-similarity.mjs';

function similarity(left, right, minimum) {
  return tokenSimilarity(createSimilarityCache(), { left, right }, minimum);
}

function tokens(count, prefix = 't') {
  return Array.from({ length: count }, (_, index) => `${prefix}${String(index)}`);
}

describe('tokenSimilarity', () => {
  it('is twice the tokens in common over the tokens of both when that reaches the minimum', () => {
    const left = tokens(10);

    expect(similarity(left, left.with(4, 'x'), 0.8)).toBe(0.9);
    expect(similarity(left, left.with(4, 'x').with(5, 'y'), 0.8)).toBe(0.8);
    expect(similarity(left, left.with(4, 'x').with(5, 'y').with(6, 'z'), 0.8)).toBe(0);
  });

  it('is 1 for identical sequences and 0 for two empty ones', () => {
    expect(similarity(tokens(10), tokens(10), 0.8)).toBe(1);
    expect(similarity([], [], 0.8)).toBe(0);
    expect(similarity([], tokens(3), 0.8)).toBe(0);
  });

  it('counts an inserted or removed run of tokens by the tokens it adds', () => {
    const left = tokens(20);
    const inserted = [...left.slice(0, 7), 'a', 'b', ...left.slice(7)];

    expect(similarity(left, inserted, 0.8)).toBeCloseTo(40 / 42);
    expect(similarity(inserted, left, 0.8)).toBeCloseTo(40 / 42);
    expect(similarity(left, [...left.slice(0, 4), ...left.slice(12)], 0.8)).toBe(0);
  });

  it('measures the tokens in common in order, not as a bag', () => {
    const left = tokens(10);

    expect(similarity(left, left.toReversed(), 0.8)).toBe(0);
    expect(similarity(left, [...left.slice(5), ...left.slice(0, 5)], 0.8)).toBe(0);
  });

  it('gives 0 for a pair whose sizes or token bags alone rule out the minimum', () => {
    expect(similarity(tokens(10), tokens(20), 0.8)).toBe(0);
    expect(similarity(tokens(20), tokens(10), 0.8)).toBe(0);
    expect(similarity(tokens(20), tokens(20, 'u'), 0.8)).toBe(0);
  });

  it('is symmetric and compares a shared prefix and suffix around a changed middle', () => {
    const left = [...tokens(30), 'a', 'b', 'c', ...tokens(30, 's')];
    const right = [...tokens(30), 'x', 'b', 'y', ...tokens(30, 's')];

    expect(similarity(left, right, 0.8)).toBe(similarity(right, left, 0.8));
    expect(similarity(left, right, 0.8)).toBeGreaterThan(0.9);
    expect(similarity(left, right, 0.99)).toBe(0);
  });

  it('skips a pair whose differing middle is too big to compare', () => {
    const around = (count) => ({
      left: ['a', ...tokens(count), 'b'],
      right: ['c', ...tokens(count), 'd'],
    });
    const small = around(9000);
    const big = around(11000);

    expect(similarity(small.left, small.right, 0.8)).toBeGreaterThan(0.99);
    expect(similarity(big.left, big.right, 0.8)).toBe(0);
  });
});
