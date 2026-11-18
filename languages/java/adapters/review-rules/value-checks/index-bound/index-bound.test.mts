import { describe, expect, it } from 'vitest';
import { parseSource as untypedParse } from '../../max-value-sums/source-file.mjs';
import { INDEX_BOUND_CHECK as untypedCheck } from './index-bound.mjs';

type Found = { readonly line: number; readonly name: string; readonly rejects: boolean };

const parseSource: (text: string, options: { file: string; kotlin: boolean }) => unknown =
  untypedParse;
const check: { find: (source: unknown) => Found[] } = untypedCheck;

function names(body: string, kotlin = false): string[] {
  return check
    .find(parseSource(`class A {\n${body}\n}\n`, { file: kotlin ? 'A.kt' : 'A.java', kotlin }))
    .map(({ name, rejects }) => `${name}${rejects ? '>' : '<='}`);
}

describe('IndexBoundOffByOne in Java', () => {
  it('reports a guard that lets the length through before a get', () => {
    expect(
      names(
        [
          'Object get(int index) {',
          '  if (index < 0 || index > size()) { throw new IndexOutOfBoundsException("x"); }',
          '  return items.get(index);',
          '}',
        ].join('\n'),
      ),
    ).toEqual([]);
    expect(
      names(
        [
          'Object get(List<String> items, int index) {',
          '  if (index < 0 || index > items.size()) { throw new IndexOutOfBoundsException("x"); }',
          '  return items.get(index);',
          '}',
        ].join('\n'),
      ),
    ).toEqual(['index>']);
  });

  it('reports the read in a later disjunct', () => {
    expect(
      names(
        'boolean ok(boolean[] table, int c) { if (c > table.length || !table[c]) { return false; } return true; }',
      ),
    ).toEqual(['c>']);
  });

  it('reports a reversed comparison before a charAt', () => {
    expect(
      names('char at(String s, int i) { if (s.length() < i) { return 0; } return s.charAt(i); }'),
    ).toEqual(['i>']);
  });

  it('reports an accepting form with the read in its branch', () => {
    expect(
      names(
        'Object get(List<String> items, int i) { if (i <= items.size()) { return items.get(i); } return null; }',
      ),
    ).toEqual(['i<=']);
  });

  it('leaves strict guards, insertion positions and other receivers', () => {
    expect(
      names(
        [
          'Object a(List<String> items, int i) { if (i < 0 || i >= items.size()) { ' +
            'throw new IndexOutOfBoundsException(); } return items.get(i); }',
          'void b(List<String> items, int i, String s) { if (i > items.size()) { ' +
            'throw new IndexOutOfBoundsException(); } items.add(i, s); }',
          'Object c(List<String> items, List<String> other, int i) { if (i > ' +
            'items.size()) { return null; } return other.get(i); }',
          'Object d(List<String> items, int i) { if (i > items.size()) { log(); } return items.get(i); }',
          'Object e(List<String> items, int i) { if (i > items.size()) { return null; } i = 0; return items.get(i); }',
        ].join('\n'),
      ),
    ).toEqual([]);
  });
});

describe('IndexBoundOffByOne in Kotlin', () => {
  it('reports a size guard before an index read', () => {
    expect(
      names(
        [
          'fun get(items: List<String>, index: Int): String? {',
          '  if (index > items.size) return null',
          '  return items[index]',
          '}',
        ].join('\n'),
        true,
      ),
    ).toEqual(['index>']);
  });
});
