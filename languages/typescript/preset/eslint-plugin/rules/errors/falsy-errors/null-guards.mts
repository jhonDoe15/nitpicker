import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { syntaxChildren } from '../../decided/syntax.mts';
import { depthFirst } from '../../typed/node-views.mts';

const FUNCTIONS = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.Program,
]);

function plain(node: TSESTree.Node, code: TSESLint.SourceCode): string {
  return code.getText(node).replaceAll('?.', '.');
}

function isNullLiteral(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Literal && node.raw === 'null';
}

function guards(node: TSESTree.Node, text: string, code: TSESLint.SourceCode): boolean {
  if (node.type === AST_NODE_TYPES.BinaryExpression) {
    if (node.operator === 'instanceof') {
      return plain(node.left, code) === text;
    }
    return (
      ['===', '!==', '==', '!='].includes(node.operator) &&
      ((isNullLiteral(node.right) && plain(node.left, code) === text) ||
        (isNullLiteral(node.left) && plain(node.right, code) === text))
    );
  }
  return (
    node.type === AST_NODE_TYPES.LogicalExpression &&
    node.operator === '&&' &&
    [node.left, node.right].some((side) => plain(side, code) === text)
  );
}

export function hasNullGuard(
  code: TSESLint.SourceCode,
  from: TSESTree.Node,
  value: TSESTree.Node,
): boolean {
  let scope: TSESTree.Node = from;
  while (!FUNCTIONS.has(scope.type) && scope.parent !== undefined) {
    scope = scope.parent;
  }
  const text = plain(value, code);
  return [...depthFirst<TSESTree.Node>(scope, syntaxChildren)].some((node) =>
    guards(node, text, code),
  );
}
