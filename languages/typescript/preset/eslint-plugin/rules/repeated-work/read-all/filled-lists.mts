import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName } from '../../collections/costly-forms/repeated-runs.mts';
import type { SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import { isInputRead, isLiteralList, readsPerElement } from './input-reads.mts';

type Filled = { readonly name: TSESTree.Identifier; readonly filler?: TSESTree.Node };

function mappedReads(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const call = unwrapped(node);
  if (call.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const callee = unwrapped(call.callee);
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    memberName(callee) === 'map' &&
    !isLiteralList(callee.object) &&
    readsPerElement(sourceCode, call.arguments[0])
  );
}

function promiseAll(node: TSESTree.Node): TSESTree.Node | undefined {
  const value = unwrapped(node);
  const call =
    value.type === AST_NODE_TYPES.AwaitExpression ? unwrapped(value.argument) : undefined;
  if (call?.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const callee = unwrapped(call.callee);
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    unwrapped(callee.object).type === AST_NODE_TYPES.Identifier &&
    (unwrapped(callee.object) as TSESTree.Identifier).name === 'Promise' &&
    memberName(callee) === 'all'
    ? call.arguments[0]
    : undefined;
}

export function readAllInit(sourceCode: SourceCode, init: TSESTree.Node): boolean {
  const all = promiseAll(init);
  return all !== undefined ? mappedReads(sourceCode, all) : mappedReads(sourceCode, init);
}

export function pushLoopFiller(
  sourceCode: SourceCode,
  statement: TSESTree.Node | undefined,
  name: string,
): TSESTree.ForOfStatement | undefined {
  if (statement?.type !== AST_NODE_TYPES.ForOfStatement || isLiteralList(statement.right)) {
    return undefined;
  }
  const { body } = statement;
  const only =
    body.type === AST_NODE_TYPES.BlockStatement && body.body.length === 1 ? body.body[0] : body;
  const call =
    only?.type === AST_NODE_TYPES.ExpressionStatement ? unwrapped(only.expression) : undefined;
  if (call?.type !== AST_NODE_TYPES.CallExpression || call.arguments.length !== 1) {
    return undefined;
  }
  const callee = unwrapped(call.callee);
  const target =
    callee.type === AST_NODE_TYPES.MemberExpression ? unwrapped(callee.object) : undefined;
  return target?.type === AST_NODE_TYPES.Identifier &&
    target.name === name &&
    memberName(callee as TSESTree.MemberExpression) === 'push' &&
    isInputRead(sourceCode, call.arguments[0])
    ? statement
    : undefined;
}
