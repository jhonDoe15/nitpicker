import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mts';
import { useCheckNotNullRecipe, useRequireNotNullRecipe } from './not-null.mts';

describe('not-null contract recipes', () => {
  it('turns require(x != null) into requireNotNull(x), keeping the message', () => {
    expect(
      applyRecipe(useRequireNotNullRecipe, 'fun f() {\n    require(a.b != null) { "b" }\n}\n'),
    ).toBe('fun f() {\n    requireNotNull(a.b) { "b" }\n}\n');
    expect(plannedLines(useRequireNotNullRecipe, 'fun f() {\n    require(a != null)\n}\n')).toEqual(
      [2],
    );
  });
  it('keeps the default message of a call without one', () => {
    expect(applyRecipe(useCheckNotNullRecipe, 'fun f() { check(x != null) }\n')).toBe(
      'fun f() { checkNotNull(x) { "Check failed." } }\n',
    );
    expect(
      applyRecipe(useRequireNotNullRecipe, 'fun f() {\n    require(a != null)\n    g()\n}\n'),
    ).toBe('fun f() {\n    requireNotNull(a) { "Failed requirement." }\n    g()\n}\n');
  });
  it('rewrites inside a class whose supertypes are known', () => {
    expect(
      applyRecipe(
        useRequireNotNullRecipe,
        'open class Base\nclass Sub : Base(), Runnable {\n    fun f(x: Int?) {\n' +
          '        require(x != null) { "x" }\n        g()\n    }\n}\n',
      ),
    ).toBe(
      'open class Base\nclass Sub : Base(), Runnable {\n    fun f(x: Int?) {\n' +
        '        requireNotNull(x) { "x" }\n        g()\n    }\n}\n',
    );
  });
  it('keeps a trailing lambda on the next line as the message', () => {
    expect(
      applyRecipe(useRequireNotNullRecipe, 'fun f() {\n    require(x != null)\n    { "m" }\n}\n'),
    ).toBe('fun f() {\n    requireNotNull(x)\n    { "m" }\n}\n');
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
    'fun f(c: Config): Unit = require(c.name != null)\n',
    'fun f(c: Config) = require(c.port != null)\n',
    'fun f(c: Config): Any? = run { require(c.name != null) }\n',
    'fun f(c: Config) {\n    val r = require(c.name != null)\n}\n',
    'class Sub : Reporter() {\n    fun nn(x: Int?) {\n        require(x != null)\n        g()\n    }\n}\n',
    'val f = {\n    require(x != null)\n}\n',
  ])('declines other conditions and a file with its own require (%s)', (text) => {
    expect(applyRecipe(useRequireNotNullRecipe, text)).toBe(text);
  });
});
