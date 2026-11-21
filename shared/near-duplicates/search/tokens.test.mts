import { describe, expect, it } from 'vitest';
import { bagOf, bagOverlap, lcsLength, matchMasks, similarEnough } from './tokens.mts';

const MULTIPLIER = 1103515245;
const INCREMENT = 12345;
const MODULUS = 2 ** 31;

function sequence(seed: number, length: number, alphabet: number): number[] {
  let state = seed;
  return Array.from({ length }, () => {
    state = (state * MULTIPLIER + INCREMENT) % MODULUS;
    return state % alphabet;
  });
}

function lcsByTable(left: readonly number[], right: readonly number[]): number {
  const first = Array.from({ length: right.length + 1 }, () => 0);
  const rows = [first];
  for (const item of left) {
    const above = rows.at(-1) ?? first;
    const row = [0];
    for (const [j, other] of right.entries()) {
      row.push(item === other ? (above[j] ?? 0) + 1 : Math.max(above[j + 1] ?? 0, row[j] ?? 0));
    }
    rows.push(row);
  }
  return (rows.at(-1) ?? first)[right.length] ?? 0;
}

describe('token similarity', () => {
  it.each([
    [1, 0, 5, 3],
    [2, 31, 32, 4],
    [3, 32, 33, 2],
    [4, 64, 70, 6],
    [5, 97, 120, 9],
    [6, 200, 180, 30],
    [7, 1, 1, 1],
  ])(
    'computes the LCS length bit-parallel like the dynamic program (seed %i, %i by %i tokens)',
    (seed, leftLength, rightLength, alphabet) => {
      const left = sequence(seed, leftLength, alphabet);
      const right = sequence(seed + 100, rightLength, alphabet);

      expect(lcsLength(matchMasks(left), right)).toBe(lcsByTable(left, right));
    },
  );

  it('counts the multiset overlap of two token bags', () => {
    expect(bagOverlap(bagOf([3, 1, 1, 2]), bagOf([1, 2, 2, 1, 1]))).toBe(3);
  });

  it('compares the Dice similarity with integers only', () => {
    expect(similarEnough(30, [50, 50], 60)).toBe(true);
    expect(similarEnough(29, [50, 50], 60)).toBe(false);
  });
});
