import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mts';
import { useIsNullOrEmptyRecipe, useOrEmptyRecipe } from './null-or-empty.mts';

describe('useIsNullOrEmptyRecipe', () => {
  const fix = (text: string): string => applyRecipe(useIsNullOrEmptyRecipe, text);

  it('rewrites a null or empty check', () => {
    expect(fix('fun f(s: String?) { if (s == null || s.isEmpty()) return }\n')).toBe(
      'fun f(s: String?) { if (s.isNullOrEmpty()) return }\n',
    );
    expect(fix('class A(val list: List<Int>?)\nval b = a.list == null || a.list.isEmpty()\n')).toBe(
      'class A(val list: List<Int>?)\nval b = a.list.isNullOrEmpty()\n',
    );
    expect(
      plannedLines(
        useIsNullOrEmptyRecipe,
        'fun f(s: String?) {\n    val b = s == null || s.isEmpty()\n}\n',
      ),
    ).toEqual([2]);
  });
  it.each([
    'fun f(b: Bag?) = b == null || b.isEmpty()',
    'fun f(o: Optional<String>?) = o == null || o.isEmpty()',
    'fun f(a: IntArray?) = a == null || a.isEmpty()',
    'fun f(a: Array<String>?) = a == null || a.isEmpty()',
    'val b = s == null || s.isEmpty()',
    'fun f(s: String?) = s == null || s.isEmpty()\nclass K(val s: Bag?)',
  ])('declines a receiver whose type is not known to have it (%s)', (text) => {
    expect(fix(`${text}\n`)).toBe(`${text}\n`);
  });
  it('is a review fix', () => {
    expect(useIsNullOrEmptyRecipe.safety).toBe('review');
  });
  it.each([
    'val b = c && s == null || s.isEmpty()',
    'val b = s == null || s.isEmpty() && c',
    'val b = s == null || t.isEmpty()',
    'val b = s == null || s.isEmpty().not()',
    'val b = s != null || s.isEmpty()',
    'val b = !s == null || s.isEmpty()',
  ])('declines %s', (text) => {
    expect(fix(`${text}\n`)).toBe(`${text}\n`);
  });
});

describe('useOrEmptyRecipe', () => {
  const fix = (text: string): string => applyRecipe(useOrEmptyRecipe, text);

  it('rewrites an elvis with an empty collection', () => {
    expect(
      fix(
        'class M(val items: Map<String, Int>?)\nfun f(xs: List<Int>?, m: M) = xs ?: emptyList()\n' +
          'val b = m.items ?: emptyMap()\n',
      ),
    ).toBe(
      'class M(val items: Map<String, Int>?)\nfun f(xs: List<Int>?, m: M) = xs.orEmpty()\n' +
        'val b = m.items.orEmpty()\n',
    );
    expect(fix('fun f(x: List<Int>?, y: Set<Int>?) = g(x ?: listOf(), y ?: setOf())\n')).toBe(
      'fun f(x: List<Int>?, y: Set<Int>?) = g(x.orEmpty(), y.orEmpty())\n',
    );
  });
  it.each([
    'fun f(l: Iterable<String>?) = l ?: emptyList()',
    'fun f(l: Sequence<String>?) = l ?: emptyList()',
    'val a = xs ?: emptyList()',
  ])('declines a receiver whose type is not known to have orEmpty (%s)', (text) => {
    expect(fix(`${text}\n`)).toBe(`${text}\n`);
  });
  it.each([
    'val a = 1 + xs ?: emptyList()',
    'val a = xs ?: emptyList<Int>()',
    'val a = xs ?: emptyList().size',
    'val a = xs ?: listOf(1)',
    'val a = xs() ?: emptyList()',
  ])('declines %s', (text) => {
    expect(fix(`${text}\n`)).toBe(`${text}\n`);
  });
});
