import type TypeScript from 'typescript';
import { typescriptApi } from '../typed/typescript-program.mts';
import type { Kind } from './kinds.mts';
import { kindOfTypeName } from './types.mts';

type Expression = TypeScript.Expression;

const ts = typescriptApi();

const ARRAY_PRODUCING_METHODS = new Set([
  'concat',
  'filter',
  'flat',
  'flatMap',
  'map',
  'slice',
  'split',
  'toReversed',
  'toSorted',
  'toSpliced',
  'with',
]);

const ARRAY_PRODUCING_STATICS = new Set([
  'Array.from',
  'Array.of',
  'Object.entries',
  'Object.keys',
  'Object.values',
]);

export function unwrapExpression(expression: Expression): Expression {
  const chain = [expression];
  for (const current of chain) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isAwaitExpression(current)
    ) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1) ?? expression;
}

export function kindOfExpression(expression: Expression): Kind | undefined {
  const unwrapped = unwrapExpression(expression);
  if (ts.isArrayLiteralExpression(unwrapped)) {
    return 'array';
  }
  if (ts.isRegularExpressionLiteral(unwrapped)) {
    return 'regexp';
  }
  if (ts.isNewExpression(unwrapped)) {
    return kindOfTypeName(unwrapped.expression.getText());
  }
  return ts.isCallExpression(unwrapped) ? kindOfCall(unwrapped) : undefined;
}

function kindOfCall(call: TypeScript.CallExpression): Kind | undefined {
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) {
    return undefined;
  }
  const method = callee.name.text;
  const callText = `${callee.expression.getText()}.${method}`;
  if (callText === 'Map.groupBy') {
    return 'map';
  }
  if (callText === 'Object.groupBy') {
    return 'groupBy';
  }
  if (method === 'exec' || method === 'match') {
    return 'execArray';
  }
  if (ARRAY_PRODUCING_STATICS.has(callText) || ARRAY_PRODUCING_METHODS.has(method)) {
    return 'array';
  }
  return rootIdentifier(callee) === 'z' ? 'schema' : undefined;
}

function rootIdentifier(expression: Expression): string | undefined {
  const chain = [expression];
  for (const current of chain) {
    if (ts.isPropertyAccessExpression(current) || ts.isCallExpression(current)) {
      chain.push(current.expression);
    }
  }
  const root = chain.at(-1);
  return root !== undefined && ts.isIdentifier(root) ? root.text : undefined;
}
