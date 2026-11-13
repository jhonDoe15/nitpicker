import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mjs';
import { explicitItRecipe } from './explicit-it.mjs';

const fix = (text) => applyRecipe(explicitItRecipe, text);

describe('explicitItRecipe', () => {
  it('drops the explicit it parameter', () => {
    expect(fix('val a = xs.map { it -> it + 1 }\n')).toBe('val a = xs.map { it + 1 }\n');
    expect(fix('xs.forEach {it->println(it)}\n')).toBe('xs.forEach { println(it)}\n');
  });
  it('keeps the body on its own line', () => {
    expect(fix('xs.forEach { it ->\n    println(it)\n}\n')).toBe(
      'xs.forEach {\n    println(it)\n}\n',
    );
    expect(plannedLines(explicitItRecipe, 'val a = 1\nxs.map { it -> it }\n')).toEqual([2]);
  });
  it('leaves typed, multi-parameter and other named parameters alone', () => {
    const text = 'xs.map { it: Int -> it }\nm.map { it, v -> v }\nxs.map { x -> x }\n';

    expect(fix(text)).toBe(text);
  });
  it('leaves when branches that test a variable named it', () => {
    const text =
      'fun f(it: Int) = when (g()) { it -> 1 else -> 2 }\nval b = when { it -> 1 else -> 2 }\n';

    expect(fix(text)).toBe(text);
  });
  it.each([
    'fun f() { list.map { /* keep */ it -> it + 1 } }\n',
    'fun f() { list.map { it /* keep */ -> it + 1 } }\n',
  ])('declines a lambda with a comment in its header (%s)', (text) => {
    expect(applyRecipe(explicitItRecipe, text)).toBe(text);
  });
});
