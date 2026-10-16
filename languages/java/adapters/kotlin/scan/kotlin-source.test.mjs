import { describe, expect, it } from 'vitest';
import {
  braceDepths,
  closingIndex,
  enclosingOpen,
  lineOf,
  lineText,
  literalAt,
  scanKotlinSource,
  splitArguments,
} from './kotlin-source.mjs';

describe('scanKotlinSource', () => {
  it('blanks comments and string bodies in place and keeps every line where it was', () => {
    const source = 'val a = "x // y" // note\n/* one\n two */ val b = 1\n';
    const { code, comments, literals } = scanKotlinSource(source);

    expect(code).toHaveLength(source.length);
    expect(code.split('\n')).toEqual([
      'val a = "      "        ',
      '      ',
      '        val b = 1',
      '',
    ]);
    expect(comments.map(({ kind, text }) => [kind, text])).toEqual([
      ['line', ' note'],
      ['block', ' one\n two '],
    ]);
    expect(literals.map(({ text, template }) => [text, template])).toEqual([['x // y', false]]);
  });

  it('reads templates, raw strings, nested comments, KDoc and character literals', () => {
    const source =
      'val a = "hi $name ${f("}")}"\nval r = """a"b"""\n/* x /* y */ z */\n/** doc */\nval c = \'"\'\nval d = "\\$x"\n';
    const scanned = scanKotlinSource(source);

    expect(scanned.literals.map(({ text, template, raw }) => [text, template, raw])).toEqual([
      ['hi $name ${f("}")}', true, false],
      ['}', false, false],
      ['a"b', false, true],
      ['\\$x', false, false],
    ]);
    expect(scanned.comments.map(({ kind }) => kind)).toEqual(['block', 'doc']);
    expect(scanned.code).not.toMatch(/[xyz"]\s*\*\//);
    expect(lineText(scanned, 5)).toBe("val c = '\"'");
  });

  it('closes a string left open at the end of a line', () => {
    const scanned = scanKotlinSource('val a = "open\nval b = 1\n');

    expect(scanned.code.split('\n')[1]).toBe('val b = 1');
  });
});

describe('position helpers', () => {
  const source = 'fun f(a: Int, b: (Int) -> Unit = {}, c: String = "x,y") {\n    g(1)\n}\n';
  const scanned = scanKotlinSource(source);

  it('maps offsets to lines and finds the literal that starts at a quote', () => {
    expect(lineOf(scanned, source.indexOf('g('))).toBe(2);
    expect(literalAt(scanned, source.indexOf('"x,y"'))?.text).toBe('x,y');
    expect(literalAt(scanned, source.indexOf('x,y'))).toBeUndefined();
  });

  it('splits arguments at top-level commas only and finds matching braces', () => {
    const open = scanned.code.indexOf('(');
    const { close, parts } = splitArguments(scanned.code, open);

    expect(scanned.code[close]).toBe(')');
    expect(parts.map(({ start, end }) => source.slice(start, end).trim())).toEqual([
      'a: Int',
      'b: (Int) -> Unit = {}',
      'c: String = "x,y"',
    ]);
    const body = scanned.code.indexOf('{\n');
    expect(closingIndex(scanned.code, body)).toBe(source.lastIndexOf('}'));
    expect(enclosingOpen(scanned.code, source.indexOf('g('))).toBe(body);
    expect(braceDepths(scanned.code)[source.indexOf('g(')]).toBe(1);
  });
});
