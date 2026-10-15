import { describe, expect, it } from 'vitest';
import { formattingHunks } from './format-hunks.mjs';

describe('formattingHunks', () => {
  it('returns nothing for identical text', () => {
    expect(formattingHunks('a\nb\n', 'a\nb\n')).toEqual([]);
  });

  it('returns one hunk per differing region with its original first line', () => {
    const hunks = formattingHunks(
      'a={}\nok\nok\nb={}\nc={}\nok\n',
      'a = {};\nok\nok\nb = {};\nc = {};\nok\n',
    );

    expect(hunks).toEqual([
      { line: 1, count: 1, original: 'a={}', formatted: 'a = {};' },
      { line: 4, count: 2, original: 'b={}\nc={}', formatted: 'b = {};\nc = {};' },
    ]);
  });

  it('locates a pure insertion at the line it precedes', () => {
    expect(formattingHunks('a\nb\n', 'a\n\nb\n')).toEqual([
      { line: 2, count: 0, original: '', formatted: '' },
    ]);
  });
});
