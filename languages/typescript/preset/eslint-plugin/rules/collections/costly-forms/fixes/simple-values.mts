import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { unwrapped } from '../repeated-runs.mts';

export function isSimpleValue(node: TSESTree.Node): boolean {
  let current = unwrapped(node);
  while (current.type === AST_NODE_TYPES.MemberExpression) {
    if (
      current.optional ||
      (current.computed && current.property.type !== AST_NODE_TYPES.Literal)
    ) {
      return false;
    }
    current = unwrapped(current.object);
  }
  return (
    current.type === AST_NODE_TYPES.Identifier ||
    current.type === AST_NODE_TYPES.ThisExpression ||
    current.type === AST_NODE_TYPES.Literal
  );
}
