import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

const LEAVES = new Set<string>([
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ThrowStatement,
  AST_NODE_TYPES.ContinueStatement,
  AST_NODE_TYPES.BreakStatement,
]);

export function unwrap(node: TSESTree.Node): TSESTree.Node {
  return node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression
    ? unwrap(node.expression)
    : node;
}

export function leaves(statement: TSESTree.Statement): boolean {
  return (
    LEAVES.has(statement.type) ||
    (statement.type === AST_NODE_TYPES.BlockStatement && statement.body.some(leaves))
  );
}

export function escapeText(value: string): string {
  return value.replaceAll(/[$.*+?()[\]{}|\\^]/gu, String.raw`\$&`);
}
