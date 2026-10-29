import { describe, expect, it } from 'vitest';
import { keepingLineEndings, withLineEndingsOf } from './line-endings.mjs';
import { lineHunks, linesOf, touchedLinesFormatted } from './line-hunks.mjs';

describe('linesOf', () => {
  it('splits after each line feed and keeps a last line without one', () => {
    expect([linesOf(''), linesOf('a\r\nb\nc')]).toEqual([[], ['a\r\n', 'b\n', 'c']]);
  });
});

describe('lineHunks', () => {
  it('finds the inserted, removed and replaced lines', () => {
    expect(lineHunks(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd', 'e'])).toEqual([
      { aStart: 1, aEnd: 2, bStart: 1, bEnd: 2 },
      { aStart: 4, aEnd: 4, bStart: 4, bEnd: 5 },
    ]);
    expect(lineHunks(['a', 'b', 'c'], ['a', 'c'])).toEqual([
      { aStart: 1, aEnd: 2, bStart: 1, bEnd: 1 },
    ]);
  });
  it('pairs a replaced run line by line when both sides have as many lines', () => {
    expect(lineHunks(['k', 'a', 'b', 'k'], ['k', 'A', 'B', 'k'])).toEqual([
      { aStart: 1, aEnd: 2, bStart: 1, bEnd: 2 },
      { aStart: 2, aEnd: 3, bStart: 2, bEnd: 3 },
    ]);
  });
  it('matches the longest common run of lines', () => {
    expect(lineHunks(['x', 'a', 'y', 'b'], ['a', 'z', 'b', 'w'])).toEqual([
      { aStart: 0, aEnd: 1, bStart: 0, bEnd: 0 },
      { aStart: 2, aEnd: 3, bStart: 1, bEnd: 2 },
      { aStart: 4, aEnd: 4, bStart: 3, bEnd: 4 },
    ]);
  });
  it('treats a middle too large to compare as one hunk', () => {
    const left = Array.from({ length: 2100 }, (_, index) => `l${index}`);
    const right = Array.from({ length: 2000 }, (_, index) => `r${index}`);

    expect(lineHunks(['k', ...left, 'k'], ['k', ...right, 'k'])).toEqual([
      { aStart: 1, aEnd: 2101, bStart: 1, bEnd: 2001 },
    ]);
  });
});

describe('touchedLinesFormatted', () => {
  it('applies the formatter changes on touched lines and keeps the rest of the file', () => {
    expect(
      touchedLinesFormatted({
        base: 'fun a() {\n  x()\n}\n',
        live: 'fun a() {\n  x()\n  y( )\n}\n',
        formatted: 'fun a() {\n    x()\n    y()\n}\n',
      }),
    ).toBe('fun a() {\n  x()\n    y()\n}\n');
  });
  it('keeps a line the formatter inserts or removes next to a touched line', () => {
    expect(
      touchedLinesFormatted({
        base: 'import b\nfun f() {}\n',
        live: 'import b\nimport a\nfun f() {}\n',
        formatted: 'import a\nimport b\n\nfun f() {}\n',
      }),
    ).toBe('import a\nimport b\n\nfun f() {}\n');
    expect(
      touchedLinesFormatted({
        base: 'a\n\n\nb\n',
        live: 'a\n\n\nb\nc\n\n\nd\n',
        formatted: 'a\n\nb\nc\n\nd\n',
      }),
    ).toBe('a\n\n\nb\nc\n\nd\n');
  });
  it('changes nothing when no formatter change meets a touched line', () => {
    const live = 'a  \nb\n';

    expect(touchedLinesFormatted({ base: 'a  \n', live, formatted: 'a\nb\n' })).toBe(live);
  });
});

describe('line endings', () => {
  it('brings back CRLF only when the source had it and the formatter dropped every CR', () => {
    expect([
      withLineEndingsOf('a\r\n', 'a\nb\n'),
      withLineEndingsOf('a\n', 'a\nb\n'),
      withLineEndingsOf('a\r\n', 'a\r\nb\n'),
    ]).toEqual(['a\r\nb\r\n', 'a\nb\n', 'a\r\nb\n']);
  });
  it('wraps a formatter so each output follows its own source', () => {
    const format = keepingLineEndings((sources) => ({
      formatted: new Map([...sources].map(([name, text]) => [name, text.replaceAll('\r', '')])),
      unformattable: ['x'],
    }));

    expect(
      format(
        new Map([
          ['crlf', 'a\r\n'],
          ['lf', 'b\n'],
        ]),
      ),
    ).toEqual({
      formatted: new Map([
        ['crlf', 'a\r\n'],
        ['lf', 'b\n'],
      ]),
      unformattable: ['x'],
    });
  });
});
