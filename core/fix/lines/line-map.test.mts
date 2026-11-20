import { describe, expect, it } from 'vitest';
import { beforeLines, changedBlocks, lineAt, lineStarts, overlaps } from './line-map.mts';

const lines = (...names: string[]): string => names.join('\n');

describe('changedBlocks', () => {
  it('finds nothing in equal texts', () => {
    expect(changedBlocks('a\nb\n', 'a\nb\n')).toEqual([]);
  });

  it.each([
    ['a changed line', lines('a', 'b', 'c'), lines('a', 'x', 'c'), [[2, 2, 2, 2]]],
    ['an added line', lines('a', 'c'), lines('a', 'b', 'c'), [[2, 1, 2, 2]]],
    ['a removed line', lines('a', 'b', 'c'), lines('a', 'c'), [[2, 2, 2, 1]]],
    [
      'two changes apart',
      lines('a', 'b', 'c', 'd', 'e'),
      lines('a', 'x', 'y', 'c', 'd', 'z'),
      [
        [2, 2, 2, 3],
        [5, 5, 6, 6],
      ],
    ],
  ])('finds %s', (_case, before, after, expected) => {
    expect(changedBlocks(before, after).map((block) => [...block.before, ...block.after])).toEqual(
      expected,
    );
  });
});

describe('beforeLines', () => {
  const blocks = changedBlocks(lines('a', 'b', 'c', 'd', 'e'), lines('a', 'x', 'y', 'c', 'd', 'z'));

  it.each([
    [1, [1, 1]],
    [2, [2, 2]],
    [3, [2, 2]],
    [4, [3, 3]],
    [5, [4, 4]],
    [6, [5, 5]],
  ])('maps line %i of the new text back', (line, expected) => {
    expect(beforeLines(blocks, line)).toEqual(expected);
  });

  it('maps a line next to a block to the block when asked for slack', () => {
    expect(beforeLines(blocks, 4, 1)).toEqual([2, 2]);
  });
});

describe('lineAt and overlaps', () => {
  it('counts the lines before an offset', () => {
    expect([0, 1, 2, 3, 4].map((offset) => lineAt(lineStarts('a\nb\nc'), offset))).toEqual([
      1, 1, 2, 2, 3,
    ]);
  });

  it('compares ranges, also empty ones with slack', () => {
    expect(overlaps([2, 4], [4, 6])).toBe(true);
    expect(overlaps([2, 3], [4, 6])).toBe(false);
    expect(overlaps([4, 3], [4, 6], 1)).toBe(true);
  });
});
