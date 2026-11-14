import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mjs';
import { useIsNullOrEmptyRecipe, useOrEmptyRecipe } from './null-or-empty.mjs';

describe('useIsNullOrEmptyRecipe', () => {
  const fix = (text) => applyRecipe(useIsNullOrEmptyRecipe, text);

  it('rewrites a null or empty check', () => {
    expect(fix('fun f(s: String?) { if (s == null || s.isEmpty()) return }\n')).toBe(
      'fun f(s: String?) { if (s.isNullOrEmpty()) return }\n',
    );
    expect(fix('val b = a.list == null || a.list.isEmpty()\n')).toBe(
      'val b = a.list.isNullOrEmpty()\n',
    );
    expect(
      plannedLines(useIsNullOrEmptyRecipe, 'val a = 1\nval b = s == null || s.isEmpty()\n'),
    ).toEqual([2]);
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
  const fix = (text) => applyRecipe(useOrEmptyRecipe, text);

  it('rewrites an elvis with an empty collection', () => {
    expect(fix('val a = xs ?: emptyList()\nval b = m.items ?: emptyMap()\n')).toBe(
      'val a = xs.orEmpty()\nval b = m.items.orEmpty()\n',
    );
    expect(fix('f(x ?: listOf(), y ?: setOf())\n')).toBe('f(x.orEmpty(), y.orEmpty())\n');
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
