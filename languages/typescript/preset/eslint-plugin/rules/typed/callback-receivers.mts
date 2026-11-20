import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

export function callbackReceiverOf(fn: TSESTree.Node): TSESTree.Node | undefined {
  const call = fn.parent;
  return call?.type === AST_NODE_TYPES.CallExpression &&
    call.arguments.some((argument) => argument === fn) &&
    call.callee.type === AST_NODE_TYPES.MemberExpression
    ? call.callee.object
    : undefined;
}
