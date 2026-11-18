import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

export function statementsAfter(node: TSESTree.Node): TSESTree.Node[] {
  const holder = node.parent;
  const body =
    holder?.type === AST_NODE_TYPES.BlockStatement || holder?.type === AST_NODE_TYPES.Program
      ? holder.body
      : [];
  return body.slice(body.indexOf(node as TSESTree.Statement) + 1);
}
