import { describe, expect, it } from 'vitest';
import { alignLines, alignTokens } from './token-alignment.mjs';

const tokens = (...lines) =>
  lines.flatMap((text, line) => text.split(' ').map((token) => ({ text: token, line })));

describe('the alignment of two token sequences', () => {
  it('pairs the longest common subsequence in order', () => {
    expect(alignTokens(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd', 'e'], 10)).toEqual([
      [0, 0],
      [2, 2],
      [3, 3],
    ]);
  });

  it('gives up past the edit budget', () => {
    expect(alignTokens(['a', 'b'], ['c', 'd'], 3)).toBeUndefined();
    expect(alignTokens([], [], 0)).toEqual([]);
  });

  it('keeps whole lines together before pairing the tokens between them', () => {
    const pairs = alignLines(
      tokens('def process', 'print start'),
      tokens('def summed', 'x', 'def process', 'print start'),
      10,
    );

    expect(pairs).toEqual([
      [0, 3],
      [1, 4],
      [2, 5],
      [3, 6],
    ]);
  });

  it('pairs tokens across lines that were joined or split', () => {
    expect(alignLines(tokens('f ( a ,', 'b )'), tokens('f ( a , b )'), 10)).toHaveLength(6);
  });
});
