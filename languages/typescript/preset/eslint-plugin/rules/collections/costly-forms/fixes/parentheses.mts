import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../../typed/node-views.mts';

const SAFE_PARENTS = new Set<string>([
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.LogicalExpression,
  AST_NODE_TYPES.UnaryExpression,
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ExpressionStatement,
  AST_NODE_TYPES.VariableDeclarator,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.CallExpression,
  AST_NODE_TYPES.ArrayExpression,
]);

export function needsParentheses(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const { parent } = node;
  if (parent === undefined || SAFE_PARENTS.has(parent.type)) {
    return false;
  }
  return (
    sourceCode.getTokenBefore(node)?.value !== '(' || sourceCode.getTokenAfter(node)?.value !== ')'
  );
}
