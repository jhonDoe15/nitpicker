import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

export function staticTextOf(node: TSESTree.Node | undefined): string | undefined {
  if (node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
    return node.value;
  }
  return node?.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0
    ? (node.quasis[0]?.value.cooked ?? undefined)
    : undefined;
}
