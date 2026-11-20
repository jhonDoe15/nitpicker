import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

export function staticMemberName(
  call: TSESTree.CallExpression,
  objectName: string,
): string | undefined {
  const { callee } = call;
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === objectName &&
    callee.property.type === AST_NODE_TYPES.Identifier
    ? callee.property.name
    : undefined;
}

export function rootIdentifierOf(node: TSESTree.Node): TSESTree.Identifier | undefined {
  const chain: TSESTree.Node[] = [node];
  for (const current of chain) {
    if (current.type !== AST_NODE_TYPES.MemberExpression) {
      return current.type === AST_NODE_TYPES.Identifier ? current : undefined;
    }
    chain.push(current.object);
  }
  return undefined;
}
