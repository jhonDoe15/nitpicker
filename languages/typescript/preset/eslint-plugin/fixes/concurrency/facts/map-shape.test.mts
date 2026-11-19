import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { mapShape, mayBeSparse } from './map-shape.mts';

function callOf(code: string): TSESTree.CallExpression {
  const calls: TSESTree.CallExpression[] = [];
  const probe: TSESLint.RuleModule<'unused'> = {
    meta: { type: 'problem', schema: [], messages: { unused: 'unused' }, defaultOptions: [] },
    create: () => ({
      ExpressionStatement(node) {
        if (node.expression.type === AST_NODE_TYPES.CallExpression) {
          calls.push(node.expression);
        }
      },
    }),
  };
  new TSESLint.Linter().verify(code, {
    languageOptions: { parser: tseslint.parser },
    plugins: { probe: { rules: { probe } } },
    rules: { 'probe/probe': 'error' },
  });
  const [call] = calls;
  if (call === undefined) {
    throw new TypeError('The code is not a call statement.');
  }
  return call;
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
    const receiver = mapShape(callOf('Promise.all(xs.map((x) => f(x)))'))?.receiver;
    expect(receiver?.type === AST_NODE_TYPES.Identifier ? receiver.name : undefined).toBe('xs');
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
