import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { chainOf, nodeChildren, soleBodyValue } from '../typed/node-views.mts';
import { preOrder } from '../../../../../../shared/traversal.mts';

const SINGLETON_FLAGS = new Set([
  'Any',
  'Unknown',
  'String',
  'Number',
  'BigInt',
  'ESSymbol',
  'Void',
  'Undefined',
  'Null',
  'Never',
  'NonPrimitive',
]);
const IDENTITY = new Set(['===', '==']);
const FLAGS = 'flags';
const NOT_ZERO = new Set(['!==', '!=', '>']);

function unwrapped(node: TSESTree.Node): TSESTree.Node | undefined {
  return node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression
    ? node.expression
    : undefined;
}

function isParameter(node: TSESTree.Node, parameter: string): boolean {
  const inner = chainOf(node, unwrapped).at(-1) ?? node;
  return inner.type === AST_NODE_TYPES.Identifier && inner.name === parameter;
}

function isParameterProperty(node: TSESTree.Node, parameter: string, property: string): boolean {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    isParameter(node.object, parameter) &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    node.property.name === property
  );
}

function mentions(node: TSESTree.Node, parameter: string): boolean {
  return preOrder(node, nodeChildren).some(
    (child) =>
      isParameter(child, parameter) &&
      !(
        child.parent?.type === AST_NODE_TYPES.MemberExpression &&
        !child.parent.computed &&
        child.parent.property === child
      ),
  );
}

function singletonFlag(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.MemberExpression || node.computed) {
    return false;
  }
  const { object, property } = node;
  const holder =
    object.type === AST_NODE_TYPES.MemberExpression
      ? !object.computed &&
        object.property.type === AST_NODE_TYPES.Identifier &&
        object.property.name === 'TypeFlags'
      : object.type === AST_NODE_TYPES.Identifier && object.name === 'TypeFlags';
  return (
    holder && property.type === AST_NODE_TYPES.Identifier && SINGLETON_FLAGS.has(property.name)
  );
}

function isFlagMask(node: TSESTree.Node, parameter: string): boolean {
  return (
    node.type === AST_NODE_TYPES.BinaryExpression &&
    node.operator === '&' &&
    ((isParameterProperty(node.left, parameter, FLAGS) && singletonFlag(node.right)) ||
      (isParameterProperty(node.right, parameter, FLAGS) && singletonFlag(node.left)))
  );
}

function isEqualPair(
  node: TSESTree.BinaryExpression,
  test: (side: TSESTree.Node, other: TSESTree.Node) => boolean,
): boolean {
  return test(node.left, node.right) || test(node.right, node.left);
}

function matchesOneMember(node: TSESTree.Node, parameter: string): boolean {
  if (isFlagMask(node, parameter)) {
    return true;
  }
  if (node.type !== AST_NODE_TYPES.BinaryExpression) {
    return false;
  }
  if (NOT_ZERO.has(node.operator)) {
    return isEqualPair(
      node,
      (side, other) =>
        isFlagMask(side, parameter) && other.type === AST_NODE_TYPES.Literal && other.value === 0,
    );
  }
  if (!IDENTITY.has(node.operator)) {
    return false;
  }
  return isEqualPair(
    node,
    (side, other) =>
      (isParameter(side, parameter) && !mentions(other, parameter)) ||
      (isParameterProperty(side, parameter, FLAGS) && singletonFlag(other)) ||
      (isParameterProperty(side, parameter, 'value') && other.type === AST_NODE_TYPES.Literal),
  );
}

function isConjunction(node: TSESTree.Node): node is TSESTree.LogicalExpression {
  return node.type === AST_NODE_TYPES.LogicalExpression && node.operator === '&&';
}

function conjuncts(node: TSESTree.Node): TSESTree.Node[] {
  return preOrder(node, (part) => (isConjunction(part) ? [part.left, part.right] : [])).filter(
    (part) => !isConjunction(part),
  );
}

export function picksAtMostOne(callback: TSESTree.Node | undefined): boolean {
  if (
    (callback?.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
      callback?.type !== AST_NODE_TYPES.FunctionExpression) ||
    callback.params[0]?.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }
  const parameter = callback.params[0].name;
  const value = soleBodyValue(callback, 'ReturnStatement');
  return value !== undefined && conjuncts(value).some((part) => matchesOneMember(part, parameter));
}
