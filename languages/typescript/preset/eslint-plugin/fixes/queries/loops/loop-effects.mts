import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { descendants } from '../../../rules/loops/loop-shapes.mts';
import { isFunction } from '../../../rules/typed/syntax-views.mts';
import type { Context } from '../../../rules/security/security-values.mts';
import { callEffects } from '../../../rules/support/io-effects.mts';
import type { LoopCall } from './loop-call.mts';

function isInside(inner: TSESTree.Range, outer: TSESTree.Range): boolean {
  return inner[0] >= outer[0] && inner[1] <= outer[1];
}

function isQuiet(context: Context, node: TSESTree.Node, target: TSESTree.CallExpression): boolean {
  if (isInside(node.range, target.range)) {
    return true;
  }
  switch (node.type) {
    case AST_NODE_TYPES.AwaitExpression:
      return node === target.parent;
    case AST_NODE_TYPES.YieldExpression:
      return false;
    case AST_NODE_TYPES.ForOfStatement:
      return !node.await;
    case AST_NODE_TYPES.CallExpression:
    case AST_NODE_TYPES.TaggedTemplateExpression:
      return callEffects(node, context).size === 0;
    default:
      return true;
  }
}

export function isInert(
  context: Context,
  loop: LoopCall,
  target: TSESTree.CallExpression,
): boolean {
  return (
    !loop.sequential ||
    descendants(loop.body, context.sourceCode.visitorKeys, () => false).every((node) =>
      isQuiet(context, node, target),
    )
  );
}

function isSkipping(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.ContinueStatement ||
    node.type === AST_NODE_TYPES.ReturnStatement ||
    node.type === AST_NODE_TYPES.ThrowStatement
  );
}

export function isAlwaysReached(context: Context, loop: LoopCall): boolean {
  if (loop.body.type !== AST_NODE_TYPES.BlockStatement) {
    return true;
  }
  const before = loop.body.body.slice(0, loop.body.body.indexOf(loop.statement));
  return !before.some((statement) =>
    descendants(statement, context.sourceCode.visitorKeys, isFunction).some(isSkipping),
  );
}
