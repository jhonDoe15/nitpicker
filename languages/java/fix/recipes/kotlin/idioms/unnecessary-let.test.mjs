import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mjs';
import { unnecessaryLetRecipe } from './unnecessary-let.mjs';

const fix = (text) => applyRecipe(unnecessaryLetRecipe, text);

describe('unnecessaryLetRecipe', () => {
  it.each([
    ['val a = x.let { it.size }', 'val a = x.size'],
    ['val a = x?.let { it.plus(1) }', 'val a = x?.plus(1)'],
    ['val a = x.let { it?.name }', 'val a = x?.name'],
    ['val a = x?.let { it.name.length }', 'val a = x?.name.length'],
    ['val a = this.user.let { it.name() }', 'val a = this.user.name()'],
    ['x.let { print(it) }', 'print(x)'],
    ['x.let { log.print(it) }', 'log.print(x)'],
    ['val a = x.let { it.plus(2) }.toString()', 'val a = x.plus(2).toString()'],
  ])('rewrites %s', (before, after) => {
    expect(fix(`${before}\n`)).toBe(`${after}\n`);
  });
  it('reports the line of the receiver', () => {
    expect(plannedLines(unnecessaryLetRecipe, 'fun f() {\n    x.let { it.a }\n}\n')).toEqual([2]);
  });
  it.each([
    'val a = x.let { it.plus(it) }',
    'val a = x.let { it.map { y -> y } }',
    'val a = x.let { it + 1 }',
    'val a = x.let { foo(it, 1) }',
    'val a = x?.let { print(it) }',
    'val a = x.let { y -> y.size }',
    'val a = x.let { val y = it.size; y }',
    'val a = f().let { it.size }',
    'val a = x.let { it.size > 1 }',
  ])('declines %s', (text) => {
    expect(fix(`${text}\n`)).toBe(`${text}\n`);
  });
});
