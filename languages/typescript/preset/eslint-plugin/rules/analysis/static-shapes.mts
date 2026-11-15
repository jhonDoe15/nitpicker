import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
type KeyOwner = { readonly computed: boolean } & (
  | { readonly key: TSESTree.Node }
  | { readonly property: TSESTree.Node }
);

export function staticKeyName(owner: KeyOwner): string | undefined {
  if (owner.computed) {
    return undefined;
  }
  const key = 'key' in owner ? owner.key : owner.property;
  if (key.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }
  return key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string'
    ? key.value
    : undefined;
}

export function logicalOperands(
  test: TSESTree.Expression,
  operator: string,
): TSESTree.Expression[] {
  const operands: TSESTree.Expression[] = [];
  const pending = [test];
  for (const node of pending) {
    if (node.type === AST_NODE_TYPES.LogicalExpression && node.operator === operator) {
      pending.push(node.left, node.right);
    } else {
      operands.push(node);
    }
  }
  return operands.sort((first, second) => first.range[0] - second.range[0]);
}
