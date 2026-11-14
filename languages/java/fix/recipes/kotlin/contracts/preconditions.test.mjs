import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mjs';
import { useCheckOrErrorRecipe, useRequireRecipe } from './preconditions.mjs';

function require(body) {
  return applyRecipe(useRequireRecipe, `fun f(a: Int, s: String?) {\n${body}\n}\n`);
}

function wrapped(body) {
  return `fun f(a: Int, s: String?) {\n${body}\n}\n`;
}

describe('useRequireRecipe', () => {
  it.each([
    ['if (a < 0) throw IllegalArgumentException("neg")', '    require(!(a < 0)) { "neg" }'],
    ['if (!ok) throw IllegalArgumentException("bad")', '    require(ok) { "bad" }'],
    ['if (a == 0) throw IllegalArgumentException()', '    require(a != 0)'],
    ['if (s == null) throw IllegalArgumentException("s")', '    require(s != null) { "s" }'],
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
    ['if (x !in 1..2) throw IllegalArgumentException("r");', '    require(!(x !in 1..2)) { "r" }'],
  ])('rewrites %s', (statement, expected) => {
    expect(require(`    ${statement}`)).toBe(wrapped(expected));
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
    expect(require(`    ${statement}`)).toBe(wrapped(`    ${statement}`));
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
    expect(require(`    ${statement}`)).toBe(wrapped(`    ${statement}`));
  });
});

describe('useCheckOrErrorRecipe', () => {
  it('rewrites a guarded throw to check', () => {
    expect(
      applyRecipe(
        useCheckOrErrorRecipe,
        'fun f() { if (!ready) throw IllegalStateException("not ready") }\n',
      ),
    ).toBe('fun f() { check(ready) { "not ready" } }\n');
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
  it('rewrites a guard that cannot become check to error inside it', () => {
    expect(
      applyRecipe(
        useCheckOrErrorRecipe,
        'fun f() { if (a) throw IllegalStateException("m") else g() }\n',
      ),
    ).toBe('fun f() { if (a) error("m") else g() }\n');
  });
  it.each([
    'fun f() { throw IllegalStateException() }\n',
    'fun f() { throw IllegalStateException(msg) }\n',
    'fun f() { throw IllegalStateException("m", e) }\n',
  ])('declines a bare throw without a literal message (%s)', (text) => {
    expect(applyRecipe(useCheckOrErrorRecipe, text)).toBe(text);
  });
});
