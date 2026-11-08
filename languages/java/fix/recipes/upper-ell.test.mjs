import { describe, expect, it } from 'vitest';
import { lowercaseEllOffsets, upperEllRecipe } from './upper-ell.mjs';

function fixed(text) {
  return lowercaseEllOffsets(text).reduce(
    (result, offset) => `${result.slice(0, offset)}L${result.slice(offset + 1)}`,
    text,
  );
}

describe('lowercaseEllOffsets', () => {
  it('finds the lowercase suffix of decimal, hex, octal and binary long literals', () => {
    expect(fixed('long a = 1l, b = 0x1fl, c = 017l, d = 0b101l, e = 1_000l;')).toBe(
      'long a = 1L, b = 0x1fL, c = 017L, d = 0b101L, e = 1_000L;',
    );
  });
  it('leaves strings, chars, text blocks, comments and names alone', () => {
    const source = [
      'String s = "1l \\" 2l";',
      "char c = '\\'';",
      'String t = """',
      '    3l "" 4l',
      '    """;',
      '// 5l',
      '/* 6l */',
      'long x1l = v1l + 7L + 8.5 + 9;',
    ].join('\n');

    expect(lowercaseEllOffsets(source)).toEqual([]);
  });
  it('keeps scanning after an unterminated string ends at its line', () => {
    expect(fixed('String s = "open\nlong a = 2l;')).toBe('String s = "open\nlong a = 2L;');
  });
});

describe('upperEllRecipe', () => {
  it('plans one fix per literal on its line, for Java files only', () => {
    const { fixes } = upperEllRecipe.plan({
      files: [
        { path: 'src/A.java', text: 'class A {\n  long a = 1l;\n}\n' },
        { path: 'src/B.kt', text: 'val b = 1l\n' },
      ],
    });

    expect(fixes).toEqual([
      {
        finding: { tool: 'checkstyle', rule: 'UpperEll', path: 'src/A.java', line: 2 },
        edits: [{ type: 'replace', path: 'src/A.java', start: 22, end: 23, text: 'L' }],
      },
    ]);
  });
});
