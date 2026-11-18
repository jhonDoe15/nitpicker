import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

const LEAVES = new Set<string>([
  AST_NODE_TYPES.Literal,
  AST_NODE_TYPES.Identifier,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ThisExpression,
]);

function isInertProperty(property: TSESTree.ObjectLiteralElement): boolean {
  return (
    property.type === AST_NODE_TYPES.Property &&
    !property.computed &&
    (property.kind !== 'init' || isInertValue(property.value))
  );
}

export function isInertValue(node: TSESTree.Node): boolean {
  switch (node.type) {
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.TSTypeAssertion: {
      return isInertValue(node.expression);
    }
    case AST_NODE_TYPES.TemplateLiteral: {
      return node.expressions.length === 0;
    }
    case AST_NODE_TYPES.UnaryExpression: {
      return node.operator === '-' && node.argument.type === AST_NODE_TYPES.Literal;
    }
    case AST_NODE_TYPES.ArrayExpression: {
      return node.elements.every(
        (element) =>
          element !== null &&
          element.type !== AST_NODE_TYPES.SpreadElement &&
          isInertValue(element),
      );
    }
    case AST_NODE_TYPES.ObjectExpression: {
      return node.properties.every(isInertProperty);
    }
    default: {
      return LEAVES.has(node.type);
    }
  }
}
