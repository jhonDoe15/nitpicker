import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../../rules/security/security-values.mts';
import { ancestorsOf, chainOf, type SourceCode } from '../../../rules/typed/node-views.mts';
import { soleReturnedValue, type Callback } from '../../../rules/typed/syntax-views.mts';
import { hasCommentIn } from '../../support/ranges.mts';
import { applyEdits, type TextEdit } from './text-edits.mts';
import { hasDenseArrayType } from './type-proofs.mts';

export type ReduceSite = {
  readonly call: TSESTree.CallExpression;
  readonly callee: TSESTree.MemberExpression;
  readonly callback: Callback;
  readonly accumulator: TSESLint.Scope.Variable;
  readonly result: TSESTree.Node;
  readonly resultRange: TSESTree.Range;
  readonly inArrowBody: boolean;
  readonly receiver: TSESTree.Node;
};
type Seed = 'array' | 'object';

const MAX_PARAMETERS = 4;

function isSeed(node: TSESTree.Node | undefined, seed: Seed): boolean {
  if (seed === 'array') {
    return node?.type === AST_NODE_TYPES.ArrayExpression && node.elements.length === 0;
  }
  return node?.type === AST_NODE_TYPES.ObjectExpression && node.properties.length === 0;
}

function isInsideChain(call: TSESTree.CallExpression): boolean {
  let node: TSESTree.Node = call;
  for (const parent of ancestorsOf(call)) {
    if (parent.type === AST_NODE_TYPES.ChainExpression) {
      return true;
    }
    const continues =
      (parent.type === AST_NODE_TYPES.MemberExpression && parent.object === node) ||
      (parent.type === AST_NODE_TYPES.CallExpression && parent.callee === node) ||
      parent.type === AST_NODE_TYPES.TSNonNullExpression;
    if (!continues) {
      return false;
    }
    node = parent;
  }
  return false;
}

function reduceCallOf(callback: Callback): TSESTree.CallExpression | undefined {
  const call = callback.parent;
  if (call.type !== AST_NODE_TYPES.CallExpression || call.arguments[0] !== callback) {
    return undefined;
  }
  const { callee } = call;
  const plain =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    !callee.optional &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'reduce';
  return plain && !call.optional && call.typeArguments === undefined && !isInsideChain(call)
    ? call
    : undefined;
}

function hasOwnArguments(sourceCode: SourceCode, callback: Callback): boolean {
  return (
    callback.type === AST_NODE_TYPES.FunctionExpression &&
    (sourceCode.getScope(callback).set.get('arguments')?.references.length ?? 0) > 0
  );
}

function isPlainCallback(sourceCode: SourceCode, callback: Callback): boolean {
  const [first, ...rest] = callback.params;
  return (
    !callback.async &&
    !callback.generator &&
    callback.typeParameters === undefined &&
    callback.returnType === undefined &&
    callback.params.length >= 2 &&
    callback.params.length <= MAX_PARAMETERS &&
    first?.type === AST_NODE_TYPES.Identifier &&
    first.typeAnnotation === undefined &&
    !first.optional &&
    rest.every((parameter) => parameter.type !== AST_NODE_TYPES.RestElement) &&
    !hasOwnArguments(sourceCode, callback)
  );
}

type TokenPair = { readonly before: TSESTree.Token; readonly after: TSESTree.Token };

function wrapping(
  sourceCode: SourceCode,
  first: TSESTree.Node | TSESTree.Token,
  last: TSESTree.Node | TSESTree.Token,
): TokenPair | undefined {
  const before = sourceCode.getTokenBefore(first);
  const after = sourceCode.getTokenAfter(last);
  return before?.value === '(' && after?.value === ')' ? { before, after } : undefined;
}

function parenthesizedRange(sourceCode: SourceCode, node: TSESTree.Node): TSESTree.Range {
  const pairs = chainOf(wrapping(sourceCode, node, node), (pair) =>
    wrapping(sourceCode, pair.before, pair.after),
  );
  const outer = pairs.at(-1);
  return outer === undefined ? node.range : [outer.before.range[0], outer.after.range[1]];
}

function accumulatorOf(
  sourceCode: SourceCode,
  callback: Callback,
): TSESLint.Scope.Variable | undefined {
  const [first] = callback.params;
  return first?.type === AST_NODE_TYPES.Identifier
    ? sourceCode.getDeclaredVariables(callback).find(({ name }) => name === first.name)
    : undefined;
}

export function reduceSite(
  context: Context,
  callback: Callback,
  seed: Seed,
): ReduceSite | undefined {
  const { sourceCode } = context;
  const call = reduceCallOf(callback);
  const accumulator = accumulatorOf(sourceCode, callback);
  const result = soleReturnedValue(callback);
  const callee = call?.callee;
  if (
    call === undefined ||
    callee?.type !== AST_NODE_TYPES.MemberExpression ||
    accumulator === undefined ||
    result === undefined ||
    call.arguments.length !== 2 ||
    !isSeed(call.arguments[1], seed) ||
    !isPlainCallback(sourceCode, callback) ||
    accumulator.references.length !== 1 ||
    hasCommentIn(sourceCode, call.range) ||
    !hasDenseArrayType(context, callee.object)
  ) {
    return undefined;
  }
  const inArrowBody = callback.body === result;
  return {
    call,
    callee,
    callback,
    accumulator,
    result,
    resultRange: inArrowBody ? parenthesizedRange(sourceCode, result) : result.range,
    inArrowBody,
    receiver: callee.object,
  };
}

export function rewrittenCall(
  sourceCode: SourceCode,
  site: ReduceSite,
  rewrite: { readonly method: string; readonly result: string },
): string {
  const { call, callee, callback } = site;
  const [accumulator, next] = callback.params;
  const edits: TextEdit[] = [
    { range: [accumulator?.range[0] ?? 0, next?.range[0] ?? 0], text: '' },
    { range: site.resultRange, text: rewrite.result },
  ];
  const body = applyEdits(sourceCode.text, callback.range, edits);
  const prefix = sourceCode.text.slice(call.range[0], callee.property.range[0]);
  return `${prefix}${rewrite.method}(${body})`;
}

export function expressionText(sourceCode: SourceCode, node: TSESTree.Node): string {
  const text = sourceCode.getText(node);
  return node.type === AST_NODE_TYPES.SequenceExpression ? `(${text})` : text;
}

export function asExpressionBody(site: ReduceSite, text: string): string {
  return site.inArrowBody && text.startsWith('{') ? `(${text})` : text;
}
