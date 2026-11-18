import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

const LEAVES = new Set<string>([
  AST_NODE_TYPES.Literal,
  AST_NODE_TYPES.Identifier,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ThisExpression,
]);

type Parts = readonly TSESTree.Node[] | undefined;

function propertyValue(property: TSESTree.ObjectLiteralElement): Parts {
  if (property.type !== AST_NODE_TYPES.Property || property.computed) {
    return undefined;
  }
  return property.kind === 'init' ? [property.value] : [];
}

function elementParts(node: TSESTree.ArrayExpression): Parts {
  const parts: TSESTree.Node[] = [];
  for (const element of node.elements) {
    if (element === null || element.type === AST_NODE_TYPES.SpreadElement) {
      return undefined;
    }
    parts.push(element);
  }
  return parts;
}

function propertyParts(node: TSESTree.ObjectExpression): Parts {
  const parts: TSESTree.Node[] = [];
  for (const property of node.properties) {
    const value = propertyValue(property);
    if (value === undefined) {
      return undefined;
    }
    appendAll(parts, value);
  }
  return parts;
}

function partsOf(node: TSESTree.Node): Parts {
  if (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSTypeAssertion
  ) {
    return [node.expression];
  }
  if (node.type === AST_NODE_TYPES.ArrayExpression) {
    return elementParts(node);
  }
  if (node.type === AST_NODE_TYPES.ObjectExpression) {
    return propertyParts(node);
  }
  const inert =
    LEAVES.has(node.type) ||
    (node.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0) ||
    (node.type === AST_NODE_TYPES.UnaryExpression &&
      node.operator === '-' &&
      node.argument.type === AST_NODE_TYPES.Literal);
  return inert ? [] : undefined;
}

export function isInertValue(node: TSESTree.Node): boolean {
  const pending = [node];
  for (const current of pending) {
    const parts = partsOf(current);
    if (parts === undefined) {
      return false;
    }
    appendAll(pending, parts);
  }
  return true;
}
