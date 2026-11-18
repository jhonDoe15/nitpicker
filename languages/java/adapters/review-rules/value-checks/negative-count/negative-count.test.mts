import { describe, expect, it } from 'vitest';
import { parseSource as untypedParse } from '../../max-value-sums/source-file.mjs';
import { NEGATIVE_COUNT_CHECK as untypedCheck } from './negative-count.mjs';

type Found = { readonly line: number; readonly name: string };

const parseSource: (text: string, options: { file: string; kotlin: boolean }) => unknown =
  untypedParse;
const check: { find: (source: unknown) => Found[] } = untypedCheck;

function names(body: string, kotlin = false): string[] {
  return check
    .find(parseSource(`class A {\n${body}\n}\n`, { file: kotlin ? 'A.kt' : 'A.java', kotlin }))
    .map(({ name }) => name);
}

describe('NegativeCountArgument in Java', () => {
  it('reports repeat and constructors given a subtraction', () => {
    expect(
      names(
        [
          'String pad(String text, int width) { return " ".repeat(width - text.length()) + text; }',
          'List<String> make(List<String> a, List<String> b) { return new ArrayList<>(a.size() - b.size()); }',
          'int[] cut(int[] a, int n) { return Arrays.copyOf(a, a.length - n); }',
        ].join('\n'),
      ),
    ).toEqual(['repeat', 'ArrayList', 'copyOf']);
  });

  it('reports a count kept in a local', () => {
    expect(
      names(
        'String pad(String text, int width) { int gap = width - text.length(); return " ".repeat(gap); }',
      ),
    ).toEqual(['repeat']);
  });

  it('leaves clamped, guarded and constant counts', () => {
    expect(
      names(
        [
          'String a(String t, int w) { return " ".repeat(Math.max(0, w - t.length())); }',
          'String b(String t, int w) { if (w > t.length()) { return " ".repeat(w - t.length()); } return t; }',
          'String c(String t, int w) { int gap = w - t.length(); if (gap <= 0) { return t; } return " ".repeat(gap); }',
          'String d(int w) { return " ".repeat(w - 1); }',
          'String e(int w) { return " ".repeat(w); }',
          'String f(String t, int w) { return t.length() >= w ? t : " ".repeat(w - t.length()); }',
          'String g(String t, int maxLen) { return " ".repeat(maxLen - t.length()); }',
          'int[] h(Object p, int[] a) { int n = 0; if (p != null) { n++; } return Arrays.copyOf(a, a.length - n); }',
        ].join('\n'),
      ),
    ).toEqual([]);
  });
});

describe('NegativeCountArgument in Kotlin', () => {
  it('reports takeLast and drop with a subtraction', () => {
    expect(
      names(
        [
          'fun merge(a: List<Int>, b: List<Int>) = a + b.takeLast(b.size - a.size)',
          'fun rest(a: List<Int>, n: Int) = a.drop(a.size - n)',
        ].join('\n'),
        true,
      ),
    ).toEqual(['takeLast', 'drop']);
  });

  it('leaves coerceAtLeast and the top-level repeat', () => {
    expect(
      names(
        [
          'fun merge(a: List<Int>, b: List<Int>) = a + b.takeLast((b.size - a.size).coerceAtLeast(0))',
          'fun loop(n: Int, m: Int) { repeat(n - m) { println(it) } }',
          'fun pad(t: String, w: Int) = " ".repeat(maxOf(0, w - t.length))',
        ].join('\n'),
        true,
      ),
    ).toEqual([]);
  });
});
