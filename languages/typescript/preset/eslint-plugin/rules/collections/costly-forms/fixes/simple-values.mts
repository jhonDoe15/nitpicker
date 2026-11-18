import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberChain } from '../repeated-runs.mts';

function isPlainMember(node: TSESTree.Node): boolean {
  return (
    node.type !== AST_NODE_TYPES.MemberExpression ||
    !(node.optional || (node.computed && node.property.type !== AST_NODE_TYPES.Literal))
  );
}

export function isSimpleValue(node: TSESTree.Node): boolean {
  const chain = memberChain(node);
  const base = chain.at(-1);
  return (
    chain.every(isPlainMember) &&
    (base?.type === AST_NODE_TYPES.Identifier ||
      base?.type === AST_NODE_TYPES.ThisExpression ||
      base?.type === AST_NODE_TYPES.Literal)
  );
}
