import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

export function statementsAfter(node: TSESTree.Node): TSESTree.Node[] {
  const holder = node.parent;
  const body: readonly TSESTree.Node[] =
    holder?.type === AST_NODE_TYPES.BlockStatement || holder?.type === AST_NODE_TYPES.Program
      ? holder.body
      : [];
  return body.slice(body.findIndex((item) => item === node) + 1);
}
