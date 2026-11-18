import { parse } from '@typescript-eslint/parser';
import type { TSESTree } from '@typescript-eslint/utils';
import { describe, expect, it } from 'vitest';
import { mapShape, mayBeSparse } from './map-shape.mts';

function callOf(code: string): TSESTree.CallExpression {
  const [statement] = parse(code, { range: true }).body;
  const expression: unknown =
    statement?.type === 'ExpressionStatement' ? statement.expression : undefined;
  if (typeof expression !== 'object' || expression === null || !('callee' in expression)) {
    throw new TypeError('The code is not a call statement.');
  }
  return expression as TSESTree.CallExpression;
}

function receiverOf(code: string): TSESTree.Node {
  const shape = mapShape(callOf(code));
  if (shape === undefined) {
    throw new TypeError('The code is not a map call.');
  }
  return shape.receiver;
}

describe('mapShape', () => {
  it('accepts exactly one mapped collection with a plain callback', () => {
    expect(mapShape(callOf('Promise.all(xs.map((x) => f(x)))'))?.receiver).toMatchObject({
      name: 'xs',
    });
  });

  it.each([
    'Promise.all(xs.map((x) => f(x)), extra)',
    'Promise.all(...xs)',
    'Promise.all(xs.map((x) => f(x), self))',
    'Promise.all(xs.map(...fs))',
    'Promise.all(xs.flatMap((x) => f(x)))',
    'Promise.all(xs["map"]((x) => f(x)))',
    'Promise.all(xs.map())',
    'Promise.all(xs)',
  ])('declines %s', (code) => {
    expect(mapShape(callOf(code))).toBeUndefined();
  });
});

describe('mayBeSparse', () => {
  it.each([
    'Promise.all(new Array(n).map(f))',
    'Promise.all(Array(n).map(f))',
    'Promise.all(new Array(n).fill(0).map(f))',
    'Promise.all(Array(n).slice(1).map(f))',
    'Promise.all([1, , 3].map(f))',
  ])('flags %s', (code) => {
    expect(mayBeSparse(receiverOf(code))).toBe(true);
  });

  it.each([
    'Promise.all(xs.map(f))',
    'Promise.all(Object.keys(o).map(f))',
    'Promise.all([1, 2, 3].map(f))',
    'Promise.all(Array.from(xs).map(f))',
  ])('keeps %s', (code) => {
    expect(mayBeSparse(receiverOf(code))).toBe(false);
  });
});
