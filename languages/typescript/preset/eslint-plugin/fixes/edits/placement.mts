import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

const STANDALONE = new Set<string>([
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.VariableDeclarator,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.ExpressionStatement,
  AST_NODE_TYPES.LogicalExpression,
  AST_NODE_TYPES.ConditionalExpression,
]);

function isOperand(node: TSESTree.Node, parent: TSESTree.Node): boolean {
  switch (parent.type) {
    case AST_NODE_TYPES.CallExpression:
    case AST_NODE_TYPES.NewExpression:
      return parent.arguments.some((argument) => argument === node);
    case AST_NODE_TYPES.Property:
      return parent.value === node && parent.parent.type === AST_NODE_TYPES.ObjectExpression;
    case AST_NODE_TYPES.ArrayExpression:
    case AST_NODE_TYPES.TemplateLiteral:
      return true;
    case AST_NODE_TYPES.AssignmentExpression:
      return parent.right === node;
    default:
      return false;
  }
}

export function placed(node: TSESTree.Node, text: string): string {
  const { parent } = node;
  const safe =
    parent !== undefined &&
    (STANDALONE.has(parent.type) ||
      isOperand(node, parent) ||
      (parent.type === AST_NODE_TYPES.UnaryExpression && parent.operator === '!'));
  return safe ? text : `(${text})`;
}
