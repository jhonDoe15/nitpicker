import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../rules/security/security-values.mts';
import { ancestorsOf } from '../../rules/typed/node-views.mts';
import { containsNode } from '../support/nodes.mts';
import { hasCommentIn, replacing, type FixPlan } from '../support/ranges.mts';
import { isGlobalName } from './support/globals.mts';

const TRANSACTION = /transaction/iu;
const UNARY_LEVEL = new Set<string>([
  AST_NODE_TYPES.Identifier,
  AST_NODE_TYPES.CallExpression,
  AST_NODE_TYPES.MemberExpression,
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.NewExpression,
  AST_NODE_TYPES.ThisExpression,
]);
const WRITES = new Set<string>([
  AST_NODE_TYPES.AssignmentExpression,
  AST_NODE_TYPES.UpdateExpression,
]);

function isTransactional(context: Context, node: TSESTree.Node): boolean {
  const { sourceCode } = context;
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return TRANSACTION.test(sourceCode.getText(node.callee));
  }
  const decorators = 'decorators' in node ? node.decorators : [];
  return decorators.some((decorator) => TRANSACTION.test(sourceCode.getText(decorator)));
}

function insideTransaction(context: Context, node: TSESTree.Node): boolean {
  return ancestorsOf(node).some((ancestor) => isTransactional(context, ancestor));
}

function writesAnything(context: Context, list: TSESTree.ArrayExpression): boolean {
  return list.elements.some(
    (element) =>
      element !== null &&
      containsNode(context.sourceCode, element, {
        matches: (node) => WRITES.has(node.type),
        intoFunctions: true,
      }),
  );
}

export function mayRunTogether(context: Context, call: TSESTree.CallExpression): boolean {
  const [list] = call.arguments;
  return (
    list?.type === AST_NODE_TYPES.ArrayExpression &&
    isGlobalName(context, call, 'Promise') &&
    !insideTransaction(context, call) &&
    !writesAnything(context, list)
  );
}

export function dropAwaitFix(
  context: Context,
  element: TSESTree.AwaitExpression,
): FixPlan | undefined {
  const { sourceCode } = context;
  const next = sourceCode.getTokenAfter(sourceCode.getFirstToken(element) ?? element);
  if (next === null) {
    return undefined;
  }
  const range: TSESTree.Range = [element.range[0], next.range[0]];
  return hasCommentIn(sourceCode, range) ? undefined : replacing(range, '');
}

function isStatementAwait(call: TSESTree.CallExpression): boolean {
  const awaited = call.parent;
  return (
    awaited.type === AST_NODE_TYPES.AwaitExpression &&
    awaited.argument === call &&
    awaited.parent.type === AST_NODE_TYPES.ExpressionStatement
  );
}

export function awaitPromiseFix(
  context: Context,
  call: TSESTree.CallExpression,
  only: TSESTree.Expression,
): FixPlan | undefined {
  const { sourceCode } = context;
  const awaited = call.parent;
  if (
    !isStatementAwait(call) ||
    awaited.type !== AST_NODE_TYPES.AwaitExpression ||
    !isGlobalName(context, call, 'Promise') ||
    hasCommentIn(sourceCode, call.range)
  ) {
    return undefined;
  }
  const text = sourceCode.getText(only);
  return replacing(call.range, UNARY_LEVEL.has(only.type) ? text : `(${text})`);
}
