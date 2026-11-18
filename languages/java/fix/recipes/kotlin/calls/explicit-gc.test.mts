import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mts';
import { explicitGcRecipe } from './explicit-gc.mts';

const fix = (text: string): string => applyRecipe(explicitGcRecipe, text);

describe('explicitGcRecipe', () => {
  it('deletes a standalone call between statements', () => {
    expect(fix('fun f() {\n    a()\n    System.gc()\n    b()\n}\n')).toBe(
      'fun f() {\n    a()\n    b()\n}\n',
    );
    expect(fix('fun f() {\n    a()\n    Runtime.getRuntime().gc()\n    b()\n}\n')).toBe(
      'fun f() {\n    a()\n    b()\n}\n',
    );
    expect(fix('fun f() {\n    a()\n    java.lang.System.gc()\n}\n')).toBe(
      'fun f() {\n    a()\n}\n',
    );
  });
  it('reports the line of the call', () => {
    expect(plannedLines(explicitGcRecipe, 'fun f() {\n    a()\n    System.gc()\n}\n')).toEqual([3]);
  });
  it('is a review fix', () => {
    expect(explicitGcRecipe.safety).toBe('review');
  });
  it('empties a function body, since a function may be empty', () => {
    expect(fix('fun f() {\n    System.gc()\n}\n')).toBe('fun f() {\n}\n');
    expect(fix('fun f() { System.gc() }\n')).toBe('fun f() { }\n');
    expect(fix('fun f(a: Int): Int {\n    System.gc()\n    return a\n}\n')).toBe(
      'fun f(a: Int): Int {\n    return a\n}\n',
    );
  });
  it('removes a semicolon and a trailing line comment with the call', () => {
    expect(fix('fun f() {\n    a()\n    System.gc(); // free memory\n    b()\n}\n')).toBe(
      'fun f() {\n    a()\n    b()\n}\n',
    );
    expect(fix('fun f() {\n    a(); System.gc(); b()\n}\n')).toBe('fun f() {\n    a(); b()\n}\n');
  });
  it('deletes a call that has a following statement in an if, loop or lambda block', () => {
    expect(
      fix('fun f(c: Boolean) {\n    if (c) {\n        System.gc()\n        a()\n    }\n}\n'),
    ).toBe('fun f(c: Boolean) {\n    if (c) {\n        a()\n    }\n}\n');
    expect(fix('val r = Runnable {\n    System.gc()\n    a()\n}\n')).toBe(
      'val r = Runnable {\n    a()\n}\n',
    );
  });
  it.each([
    [
      'the only statement of an if',
      'fun f(c: Boolean) {\n    if (c) {\n        System.gc()\n    }\n}\n',
    ],
    [
      'the last statement of an if',
      'fun f(c: Boolean) {\n    if (c) {\n        a()\n        System.gc()\n    }\n}\n',
    ],
    [
      'the only statement of a loop',
      'fun f() {\n    while (true) {\n        System.gc()\n    }\n}\n',
    ],
    [
      'the only statement of a finally',
      'fun f() {\n    try {\n        a()\n    } finally {\n        System.gc()\n    }\n}\n',
    ],
    [
      'the only statement of a try',
      'fun f() {\n    try {\n        System.gc()\n    } catch (e: Exception) {\n        a()\n    }\n}\n',
    ],
    ['a lambda result', 'val r = Runnable {\n    a()\n    System.gc()\n}\n'],
    [
      'the only statement of an init block',
      'class A {\n    init {\n        System.gc()\n    }\n}\n',
    ],
    ['an if without braces', 'fun f(c: Boolean) {\n    if (c)\n        System.gc()\n}\n'],
    ['an if on one line', 'fun f(c: Boolean) {\n    if (c) System.gc()\n}\n'],
    ['an else without braces', 'fun f(c: Boolean) {\n    if (c) a() else System.gc()\n}\n'],
    ['a loop without braces', 'fun f(xs: List<Int>) {\n    for (x in xs) System.gc()\n}\n'],
    [
      'a when branch',
      'fun f(x: Int) {\n    when (x) {\n        1 -> System.gc()\n        else -> a()\n    }\n}\n',
    ],
    ['an expression body', 'fun f() = System.gc()\n'],
    ['an assignment', 'fun f() {\n    val x = System.gc()\n    a(x)\n}\n'],
    ['an argument', 'fun f() {\n    a(System.gc())\n}\n'],
    ['a chained call', 'fun f() {\n    System.gc()\n        .also { a() }\n}\n'],
    ['a call on a further line', 'fun f() {\n    System.gc().also { a() }\n}\n'],
    ['a reference', 'fun f() {\n    run(System::gc)\n}\n'],
    ['an instance call', 'fun f(r: Runtime) {\n    a()\n    r.gc()\n    b()\n}\n'],
    ['finalization', 'fun f() {\n    a()\n    System.runFinalization()\n    b()\n}\n'],
    ['a string', 'fun f() {\n    a("System.gc()")\n    b()\n}\n'],
    ['a comment', 'fun f() {\n    a()\n    // System.gc()\n    b()\n}\n'],
    ['another System', 'import other.System\n\nfun f() {\n    a()\n    System.gc()\n    b()\n}\n'],
    ['a member call', 'fun f(x: X) {\n    a()\n    x.System.gc()\n    b()\n}\n'],
  ])('declines %s', (_name, text) => {
    expect(fix(text)).toBe(text);
  });
});
