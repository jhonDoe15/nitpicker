import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mjs';
import { emptyBlocksRecipe } from './empty-blocks.mjs';

const fix = (text) => applyRecipe(emptyBlocksRecipe, text);

describe('emptyBlocksRecipe', () => {
  it('drops the empty body of a class', () => {
    expect(fix('class A {}\nclass B(val x: Int) : C() {\n}\nobject O {}\n')).toBe(
      'class A\nclass B(val x: Int) : C()\nobject O {}\n',
    );
    expect(plannedLines(emptyBlocksRecipe, 'val a = 1\nclass A {}\n')).toEqual([2]);
  });
  it('keeps classes with a body, a comment inside, or a special kind', () => {
    const text = [
      'class A { val x = 1 }',
      'class B {\n    // later\n}',
      'enum class E {}',
      'annotation class N {}',
      'val k = A::class',
    ].join('\n');

    expect(fix(`${text}\n`)).toBe(`${text}\n`);
  });
  it('drops an empty finally after a catch', () => {
    expect(
      fix(
        'fun f() {\n    try {\n        g()\n    } catch (e: Exception) {\n        h()\n    } finally {\n    }\n}\n',
      ),
    ).toBe(
      'fun f() {\n    try {\n        g()\n    } catch (e: Exception) {\n        h()\n    }\n}\n',
    );
  });
  it('keeps an empty finally that ends a try without catch', () => {
    const text = 'fun f() {\n    try {\n        g()\n    } finally {\n    }\n}\n';

    expect(fix(text)).toBe(text);
  });
  it('drops an empty init block', () => {
    expect(fix('class A(val x: Int) {\n    init {}\n    val y = 1\n}\n')).toBe(
      'class A(val x: Int) {\n    val y = 1\n}\n',
    );
    expect(fix('class A {\n    init { // later\n    }\n}\n')).toBe(
      'class A {\n    init { // later\n    }\n}\n',
    );
  });
  it('drops empty primary constructor parentheses', () => {
    expect(fix('class A() : B()\nclass C<T>() {\n    val x = 1\n}\n')).toBe(
      'class A : B()\nclass C<T> {\n    val x = 1\n}\n',
    );
  });
  it('keeps them when a secondary constructor needs the primary one', () => {
    const text = 'class A() {\n    constructor(x: Int) : this()\n}\n';

    expect(fix(text)).toBe(text);
  });
  it('does not reach past a class without a body into the next declaration', () => {
    expect(fix('class Marker\nfun f() {}\n')).toBe('class Marker\nfun f() {}\n');
    expect(fix('class Marker(val a: Int)\nobject O {}\nclass P : Q,\n    R {}\n')).toBe(
      'class Marker(val a: Int)\nobject O {}\nclass P : Q,\n    R\n',
    );
    expect(fix('class A(\n    val f: () -> Int = { 1 },\n) {}\n')).toBe(
      'class A(\n    val f: () -> Int = { 1 },\n)\n',
    );
  });
  it.each([
    'class A(/* keep */)\n',
    'class B() { /* x */ }\n',
    'class C /* c */ {}\n',
    'class D() : Base() { }\n// d\n',
  ])('keeps the comments in %s', (text) => {
    expect(fix(text).includes(text.slice(text.indexOf('/'), text.indexOf('/') + 2))).toBe(true);
  });
});
