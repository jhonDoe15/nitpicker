import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { unwrapped } from '../repeated-runs.mts';

function isSimpleKey(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Literal;
}

export function isSimpleValue(node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  switch (value.type) {
    case AST_NODE_TYPES.Identifier:
    case AST_NODE_TYPES.ThisExpression:
    case AST_NODE_TYPES.Literal:
      return true;
    case AST_NODE_TYPES.MemberExpression:
      return (
        !value.optional &&
        isSimpleValue(value.object) &&
        (!value.computed || isSimpleKey(value.property))
      );
    default:
      return false;
  }
}
