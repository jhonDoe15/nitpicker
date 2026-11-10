import { describe, expect, it } from 'vitest';
import { alignSequences, alignTokens } from './token-alignment.mjs';

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

  it('pairs tokens across lines that were joined or split', () => {
    expect(alignSequences(tokens('f ( a ,', 'b )'), tokens('f ( a , b )'), 10)).toHaveLength(6);
  });

  it('pairs whole equal lines when the tokens between them differ past the budget', () => {
    const pairs = alignSequences(
      tokens('a b c d', 'keep this line', 'e f g h'),
      tokens('w x y z', 'keep this line', 'q r s t'),
      4,
    );

    expect(pairs).toEqual([
      [4, 4],
      [5, 5],
      [6, 6],
    ]);
  });

  it('gives up when neither the tokens nor the lines fit the budget', () => {
    expect(alignSequences(tokens('a b', 'c d'), tokens('w x', 'y z'), 1)).toBeUndefined();
  });

  it('pairs a long common prefix and suffix without spreading them onto the stack', () => {
    const long = Array.from({ length: 300_000 }, (_, index) => ({ text: String(index), line: 1 }));
    const edited = long.with(150_000, { text: 'edited', line: 1 });

    expect(alignSequences(long, edited, 10)).toHaveLength(299_999);
  });
});
