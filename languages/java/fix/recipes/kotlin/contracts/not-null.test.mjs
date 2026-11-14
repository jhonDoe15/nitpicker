import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mjs';
import { useCheckNotNullRecipe, useRequireNotNullRecipe } from './not-null.mjs';

describe('not-null contract recipes', () => {
  it('turns require(x != null) into requireNotNull(x), keeping the message', () => {
    expect(
      applyRecipe(useRequireNotNullRecipe, 'fun f() {\n    require(a.b != null) { "b" }\n}\n'),
    ).toBe('fun f() {\n    requireNotNull(a.b) { "b" }\n}\n');
    expect(plannedLines(useRequireNotNullRecipe, 'fun f() {\n    require(a != null)\n}\n')).toEqual(
      [2],
    );
  });
  it('turns check(x != null) into checkNotNull(x)', () => {
    expect(applyRecipe(useCheckNotNullRecipe, 'fun f() { check(x != null) }\n')).toBe(
      'fun f() { checkNotNull(x) }\n',
    );
  });
  it('keeps each recipe to its own function', () => {
    const text = 'fun f() { check(x != null) }\n';

    expect(applyRecipe(useRequireNotNullRecipe, text)).toBe(text);
  });
  it.each([
    'fun f() { require(x != null && y) }\n',
    'fun f() { require(null != x) }\n',
    'fun f() { require(x?.y != null) }\n',
    'fun require(c: Boolean) {}\nfun f() { require(x != null) }\n',
  ])('declines other conditions and a file with its own require (%s)', (text) => {
    expect(applyRecipe(useRequireNotNullRecipe, text)).toBe(text);
  });
});
