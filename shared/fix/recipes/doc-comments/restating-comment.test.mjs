import { describe, expect, it } from 'vitest';
import {
  DOC_COMMENT_RULE,
  deletionFix,
  isCovered,
  restatesItsName,
  wholeLines,
} from './restating-comment.mjs';

describe('wholeLines', () => {
  it('takes the lines a comment fills, with their line breaks', () => {
    const text = 'a\n  /** x */\nb\n';

    expect(wholeLines(text, { start: 4, end: 12 })).toEqual({ start: 2, end: 13 });
  });

  it('takes a comment at the start and at the end of the file', () => {
    expect(wholeLines('/** x */\nb', { start: 0, end: 8 })).toEqual({ start: 0, end: 9 });
    expect(wholeLines('b\n/** x */', { start: 2, end: 10 })).toEqual({ start: 2, end: 10 });
  });

  it.each([
    ['code before it', 'a; /** x */\n', 3, 11],
    ['code after it', '/** x */ b\n', 0, 8],
  ])('declines a comment with %s on its line', (_, text, start, end) => {
    expect(wholeLines(text, { start, end })).toBeUndefined();
  });
});

describe('restatesItsName', () => {
  it('is true for a description made of the name and filler words', () => {
    expect(restatesItsName({ name: 'getUserName', lines: ['Gets the user name.'] })).toBe(true);
  });

  it.each([
    ['says more', { name: 'getUserName', lines: ['Reads the name from the session cookie.'] }],
    ['has tags with text', { name: 'run', lines: ['Run.'], detailed: true }],
  ])('is false for a comment that %s', (_, comment) => {
    expect(restatesItsName(comment)).toBe(false);
  });
});

describe('deletionFix', () => {
  it('deletes the lines of the comment and nothing else', () => {
    const finding = { tool: 't', rule: 'r', path: 'a', line: 2 };

    expect(
      deletionFix({ finding, path: 'a', text: 'x\n/** y */\nz', span: { start: 2, end: 10 } }),
    ).toEqual([{ finding, edits: [{ type: 'replace', path: 'a', start: 2, end: 11, text: '' }] }]);
  });
});

describe('isCovered', () => {
  it('is false when an exception lifts the rule for the file', () => {
    const isExcepted = (rule, name) => rule === DOC_COMMENT_RULE && name === 'a.ts';

    expect([
      isCovered({ isExcepted }, 'a.ts'),
      isCovered({ isExcepted }, 'b.ts'),
      isCovered({}, 'a.ts'),
    ]).toEqual([false, true, true]);
  });
});
