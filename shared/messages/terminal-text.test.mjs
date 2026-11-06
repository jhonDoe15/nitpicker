import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { colorEnabled, displayPath, withoutAnsi } from './terminal-text.mjs';

const terminal = { isTTY: true };
const pipe = {};

describe('colorEnabled', () => {
  it.each([
    ['a terminal', terminal, {}, true],
    ['a pipe or file', pipe, {}, false],
    ['a pipe with FORCE_COLOR', pipe, { FORCE_COLOR: '1' }, true],
    ['a pipe with an empty FORCE_COLOR', pipe, { FORCE_COLOR: '' }, true],
    ['a terminal with FORCE_COLOR=0', terminal, { FORCE_COLOR: '0' }, false],
    ['a terminal with FORCE_COLOR=false', terminal, { FORCE_COLOR: 'false' }, false],
    ['a terminal with NO_COLOR', terminal, { NO_COLOR: '1' }, false],
    ['a terminal with an empty NO_COLOR', terminal, { NO_COLOR: '' }, false],
    ['a pipe with both NO_COLOR and FORCE_COLOR', pipe, { NO_COLOR: '1', FORCE_COLOR: '1' }, false],
    ['a dumb terminal', terminal, { TERM: 'dumb' }, false],
  ])('on %s returns %s', (_name, stream, environment, expected) => {
    expect(colorEnabled(stream, environment)).toBe(expected);
  });
});

describe('withoutAnsi', () => {
  it('removes colour, cursor and hyperlink sequences and keeps the text', () => {
    const text = [
      '\u001B[1m\u001B[31mFAIL\u001B[39m\u001B[22m src/a.test.ts',
      '\u001B[2K\u001B[1Gexpected \u001B[32m1\u001B[39m',
      '\u001B]8;;https://example.com\u0007link\u001B]8;;\u0007',
      '\u001B]8;;https://example.com\u001B\\other\u001B]8;;\u001B\\',
      '\u001B(Breset\u001Bc',
    ].join('\n');

    expect(withoutAnsi(text)).toBe('FAIL src/a.test.ts\nexpected 1\nlink\nother\nreset');
  });

  it('leaves plain text and non-strings unchanged', () => {
    expect(withoutAnsi('a [31m b')).toBe('a [31m b');
    expect(withoutAnsi(undefined)).toBeUndefined();
  });
});

describe('displayPath', () => {
  const current = path.join(path.sep, 'work', 'app');

  it('prints a path inside the current folder relative to it', () => {
    expect(displayPath(path.join(current, 'reports', 'report.txt'), current)).toBe(
      path.join('reports', 'report.txt'),
    );
    expect(displayPath(path.join(current, '..cache', 'a'), current)).toBe(
      path.join('..cache', 'a'),
    );
    expect(displayPath(current, current)).toBe('.');
  });

  it('keeps a path outside the current folder absolute', () => {
    const sibling = path.join(path.sep, 'work', 'app-reports', 'report.txt');
    const parent = path.join(path.sep, 'work');

    expect(displayPath(sibling, current)).toBe(sibling);
    expect(displayPath(parent, current)).toBe(parent);
  });
});
