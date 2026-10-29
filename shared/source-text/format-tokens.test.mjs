import { describe, expect, it } from 'vitest';
import { changesQuoteStyle, formatAgnosticText } from './format-tokens.mjs';

describe('source text without what a formatter rewrites', () => {
  it.each([
    ['src/a.py', "print('hello ' + name)", 'print( "hello " + name )'],
    ['src/a.ts', 'items.map(item => log(item,));', 'items.map((item) => log(item))'],
    ['src/A.java', 'if(x==3){', 'if (x == 3) {'],
    ['src/A.kt', 'listOf(a, b,)', 'listOf(a, b)'],
  ])('reads %s lines the same before and after formatting', (filePath, before, after) => {
    expect(formatAgnosticText(before, filePath)).toBe(formatAgnosticText(after, filePath));
  });

  it.each([
    ['src/a.py', "print('a')", "print('b')"],
    ['src/A.java', "char c = 'a';", 'char c = "a";'],
    ['src/a.ts', 'run(a, b)', 'run(a)'],
  ])('tells a real edit of a %s line apart', (filePath, before, after) => {
    expect(formatAgnosticText(before, filePath)).not.toBe(formatAgnosticText(after, filePath));
  });

  it('ignores quote style only where the formatter changes it', () => {
    expect(['a.py', 'a.mts', 'a.jsx', 'A.java', 'A.kt'].map(changesQuoteStyle)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });
});
