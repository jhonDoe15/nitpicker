import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mts';
import { useCheckOrErrorRecipe, useRequireRecipe } from './preconditions.mts';

function required(body: string): string {
  return applyRecipe(useRequireRecipe, `fun f(a: Int, s: String?) {\n${body}\n}\n`);
}

function wrapped(body: string): string {
  return `fun f(a: Int, s: String?) {\n${body}\n}\n`;
}

describe('useRequireRecipe', () => {
  it.each([
    ['if (a < 0) throw IllegalArgumentException("neg")', '    require(!(a < 0)) { "neg" }'],
    ['if (!ok) throw IllegalArgumentException("bad")', '    require(ok) { "bad" }'],
    ['if (a == 0) throw IllegalArgumentException()', '    require(a != 0)'],
    ['if (x !is String) throw IllegalArgumentException("t")', '    require(x is String) { "t" }'],
    ['if (x is String) throw IllegalArgumentException("t")', '    require(x !is String) { "t" }'],
    ['if (!(x is String)) throw IllegalArgumentException("t")', '    require(x is String) { "t" }'],
    [
      'if (c.name == null) throw IllegalArgumentException()',
      '    requireNotNull(c.name) { "Failed requirement." }',
    ],
    ['if (s == null) throw IllegalArgumentException("s")', '    requireNotNull(s) { "s" }'],
    [
      'if (!list.isEmpty()) throw IllegalArgumentException("x")',
      '    require(list.isEmpty()) { "x" }',
    ],
    [
      'if (a > 0 && b > 0) throw IllegalArgumentException("x")',
      '    require(!(a > 0 && b > 0)) { "x" }',
    ],
    [
      'if (ok) {\n        throw java.lang.IllegalArgumentException("$a")\n    }',
      '    require(!ok) { "$a" }',
    ],
    ['if (x !in 1..2) throw IllegalArgumentException("r");', '    require(x in 1..2) { "r" }'],
  ])('rewrites %s', (statement, expected) => {
    expect(required(`    ${statement}`)).toBe(wrapped(expected));
  });
  it('keeps a statement that follows a one-line guard on the same line', () => {
    expect(required('    if (a < 0) throw IllegalArgumentException("m"); g()')).toBe(
      wrapped('    require(!(a < 0)) { "m" }; g()'),
    );
    expect(required('    if (a < 0) throw IllegalArgumentException("m"); else g()')).toBe(
      wrapped('    if (a < 0) throw IllegalArgumentException("m"); else g()'),
    );
  });
  it('leaves a guard with or without a message to a class with unknown supertypes', () => {
    const text =
      'class S : Base() {\n    fun f(a: Int) {\n        if (a < 0) throw IllegalArgumentException()\n    }\n}\n';
    const withMessage = text.replace('IllegalArgumentException()', 'IllegalArgumentException("m")');

    expect(applyRecipe(useRequireRecipe, text)).toBe(text);
    expect(applyRecipe(useRequireRecipe, withMessage)).toBe(withMessage);
  });
  it.each([
    'fun h(check: (Boolean) -> Unit, a: Int) {\n    if (a < 0) throw IllegalArgumentException("m")\n}\n',
    'fun h(a: Int) {\n    val require = { b: Boolean -> b }\n    if (a < 0) throw IllegalArgumentException("m")\n}\n',
    'fun h(a: Int, require: (Boolean) -> Unit) {\n    if (a < 0) throw IllegalArgumentException("m")\n}\n',
  ])('declines when require is declared as a parameter or local (%s)', (text) => {
    expect(applyRecipe(useRequireRecipe, text)).toBe(text);
  });
  it('reports the line of the if', () => {
    const text = 'fun f() {\n    g()\n    if (x) throw IllegalArgumentException("m")\n}\n';

    expect(plannedLines(useRequireRecipe, text)).toEqual([3]);
  });
  it.each([
    'if (a) throw IllegalArgumentException("m") else g()',
    'if (a) throw IllegalArgumentException("m", cause)',
    'if (a) throw IllegalArgumentException(message)',
    'if (a) throw IllegalStateException("m")',
    'if (a) { log(); throw IllegalArgumentException("m") }',
    'if (a) { // why\n throw IllegalArgumentException("m") }',
    'else if (a) throw IllegalArgumentException("m")',
    'val v = if (a) throw IllegalArgumentException("m")',
  ])('declines %s', (statement) => {
    expect(required(`    ${statement}`)).toBe(wrapped(`    ${statement}`));
  });
  it('declines a file that declares its own require or exception class', () => {
    const own =
      'fun require(c: Boolean) {}\nfun f() { if (a) throw IllegalArgumentException("m") }\n';
    const clazz =
      'class IllegalArgumentException\nfun f() { if (a) throw IllegalArgumentException("m") }\n';

    expect(applyRecipe(useRequireRecipe, own)).toBe(own);
    expect(applyRecipe(useRequireRecipe, clazz)).toBe(clazz);
  });
  it.each([
    'if (/* why */ a == 1) throw IllegalArgumentException("m")',
    'if (a == 1 // same\n    ) throw IllegalArgumentException("m")',
    'if (a < 0 /* neg */) throw IllegalArgumentException("m")',
  ])('declines a guard with a comment inside (%s)', (statement) => {
    expect(required(`    ${statement}`)).toBe(wrapped(`    ${statement}`));
  });
});

describe('useCheckOrErrorRecipe', () => {
  it.each([
    [
      'fun f() { if (!ready) throw IllegalStateException("not ready") }\n',
      'fun f() { check(ready) { "not ready" } }\n',
    ],
    [
      'fun f() { if (s == null) throw IllegalStateException("m") }\n',
      'fun f() { checkNotNull(s) { "m" } }\n',
    ],
    [
      'fun f() { if (a) throw IllegalStateException("m") else g() }\n',
      'fun f() { if (a) error("m") else g() }\n',
    ],
  ])('rewrites a guarded throw (%s)', (text, expected) => {
    expect(applyRecipe(useCheckOrErrorRecipe, text)).toBe(expected);
  });
  it('rewrites a bare throw with a message to error', () => {
    expect(
      applyRecipe(
        useCheckOrErrorRecipe,
        'fun f(x: Int?) = x ?: throw IllegalStateException("no x")\n',
      ),
    ).toBe('fun f(x: Int?) = x ?: error("no x")\n');
    expect(
      applyRecipe(useCheckOrErrorRecipe, 'fun f() { throw IllegalStateException("a $b") }\n'),
    ).toBe('fun f() { error("a $b") }\n');
  });
  it('keeps error() out of classes whose supertypes may define it', () => {
    const text =
      'class S : Base() {\n    fun f(): Int {\n        throw IllegalStateException("m")\n    }\n}\n';

    expect(applyRecipe(useCheckOrErrorRecipe, text)).toBe(text);
    expect(
      applyRecipe(
        useCheckOrErrorRecipe,
        'class S : Runnable {\n    fun f(): Int {\n        throw IllegalStateException("m")\n    }\n}\n',
      ),
    ).toBe('class S : Runnable {\n    fun f(): Int {\n        error("m")\n    }\n}\n');
  });
  it.each([
    'fun f() { throw IllegalStateException() }\n',
    'fun f() { throw IllegalStateException(msg) }\n',
    'fun f() { throw IllegalStateException("m", e) }\n',
  ])('declines a bare throw without a literal message (%s)', (text) => {
    expect(applyRecipe(useCheckOrErrorRecipe, text)).toBe(text);
  });
});
