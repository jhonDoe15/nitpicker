import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../../rules/security/security-values.mts';
import type { SourceCode } from '../../../rules/typed/node-views.mts';
import { hasCommentIn } from '../../support/ranges.mts';
import { applyEdits, type TextEdit } from './text-edits.mts';
import { hasDenseArrayType } from '../type-proofs.mts';

export type Callback = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
export type ReduceSite = {
  readonly call: TSESTree.CallExpression;
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
  while (
    node.parent.type === AST_NODE_TYPES.MemberExpression ||
    node.parent.type === AST_NODE_TYPES.CallExpression ||
    node.parent.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    if (node.parent.type === AST_NODE_TYPES.MemberExpression && node.parent.object !== node) {
      return false;
    }
    if (node.parent.type === AST_NODE_TYPES.CallExpression && node.parent.callee !== node) {
      return false;
    }
    node = node.parent;
  }
  return node.parent.type === AST_NODE_TYPES.ChainExpression;
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

function returnedOf(callback: Callback): TSESTree.Node | undefined {
  const { body } = callback;
  if (body.type !== AST_NODE_TYPES.BlockStatement) {
    return body;
  }
  const [only] = body.body;
  return body.body.length === 1 && only?.type === AST_NODE_TYPES.ReturnStatement
    ? (only.argument ?? undefined)
    : undefined;
}

function parenthesizedRange(sourceCode: SourceCode, node: TSESTree.Node): TSESTree.Range {
  let range = node.range;
  for (;;) {
    const before = sourceCode.getTokenBefore({ range } as TSESTree.Node);
    const after = sourceCode.getTokenAfter({ range } as TSESTree.Node);
    if (before?.value !== '(' || after?.value !== ')') {
      return range;
    }
    range = [before.range[0], after.range[1]];
  }
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
  const result = returnedOf(callback);
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
  const { call, callback } = site;
  const [accumulator, next] = callback.params;
  const callee = call.callee as TSESTree.MemberExpression;
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
