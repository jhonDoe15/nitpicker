import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf } from '../../typed/node-views.mts';

function isFunction(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

export function enclosingUnit(node: TSESTree.Node): TSESTree.Node {
  const chain = ancestorsOf(node).filter(({ type }) => type !== AST_NODE_TYPES.Program);
  return chain.find(isFunction) ?? chain.at(-1) ?? node;
}
