import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mjs';
import { varCouldBeValRecipe } from './var-could-be-val.mjs';

const fix = (text) => applyRecipe(varCouldBeValRecipe, text);
const inFunction = (body) => `fun f() {\n${body}\n}\n`;

describe('varCouldBeValRecipe', () => {
  it('turns a never-reassigned local var into val', () => {
    expect(fix(inFunction('    var a = 1\n    var b: Int = 2\n    println(a + b)'))).toBe(
      inFunction('    val a = 1\n    val b: Int = 2\n    println(a + b)'),
    );
    expect(plannedLines(varCouldBeValRecipe, inFunction('    var a = 1'))).toEqual([2]);
  });
  it('works inside lambdas and init blocks', () => {
    expect(fix('class A {\n    init {\n        var x = 1\n        use(x)\n    }\n}\n')).toBe(
      'class A {\n    init {\n        val x = 1\n        use(x)\n    }\n}\n',
    );
  });
  it.each([
    'var a = 1\n    a = 2',
    'var a = 1\n    a += 2',
    'var a = 1\n    a++',
    'var a = 1\n    --a',
    'var a = 1\n    run { a = 3 }',
    'var a = 1\n    val r = ::a',
    'var a = 1\n    foo(a = 2)',
    'var a = 1\n    run { var a = 2; a = 3 }',
    'var a by lazy { 1 }',
    'var a: Int\n    a = 1',
    'var (a, b) = pair',
  ])('declines %s', (body) => {
    const text = inFunction(`    ${body}`);

    expect(fix(text)).toBe(text);
  });
  it('leaves properties of classes, objects and files alone', () => {
    const text = 'var top = 1\nclass A {\n    var p = 1\n}\nobject O {\n    var q = 2\n}\n';

    expect(fix(text)).toBe(text);
  });
  it('leaves a name that is only a field of another value being assigned', () => {
    expect(fix(inFunction('    var a = 1\n    other.a = 2'))).toBe(
      inFunction('    val a = 1\n    other.a = 2'),
    );
  });
  it('leaves properties of a class whose header holds braces alone', () => {
    const text =
      'class A(val f: () -> Int = { 1 }) {\n  fun a() { counter = 5 }\n  var counter = 0\n}\n';

    expect(fix(text)).toBe(text);
    expect(fix('class A(val f: () -> Int = { 1 }) {\n  var counter = 0\n}\n')).toBe(
      'class A(val f: () -> Int = { 1 }) {\n  var counter = 0\n}\n',
    );
  });
  it('leaves a name that is assigned before the declaration', () => {
    const text = inFunction('    while (more()) {\n        total = 1\n    }\n    var total = 0');

    expect(fix(text)).toBe(text);
  });
});
