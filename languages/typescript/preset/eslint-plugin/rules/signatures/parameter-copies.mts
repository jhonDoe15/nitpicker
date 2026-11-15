import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { Ranged } from '../typed/node-views.mts';

type Variable = TSESLint.Scope.Variable;

const COPY_METHODS = new Set([
  'slice',
  'concat',
  'toSorted',
  'toReversed',
  'toSpliced',
  'with',
  'map',
  'filter',
  'flat',
  'flatMap',
]);

const COPY_CONSTRUCTORS = new Set(['Set', 'Map', 'Array']);

const COPY_FUNCTIONS = new Set(['structuredClone', 'from']);

const FRESH_CONTAINERS = new Set(['Set', 'Map']);

export function calleeName(call: TSESTree.CallExpression): string | undefined {
  const { callee } = call;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
    ? callee.property.name
    : undefined;
}

export function isObjectAssign(call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'Object' &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'assign'
  );
}

export function isFreshContainer(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.ArrayExpression && node.elements.length === 0) ||
    (node.type === AST_NODE_TYPES.ObjectExpression && node.properties.length === 0) ||
    (node.type === AST_NODE_TYPES.NewExpression &&
      node.callee.type === AST_NODE_TYPES.Identifier &&
      FRESH_CONTAINERS.has(node.callee.name) &&
      node.arguments.length === 0)
  );
}

function isCopy(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.ArrayExpression) {
    return node.elements.some((element) => element?.type === AST_NODE_TYPES.SpreadElement);
  }
  if (node.type === AST_NODE_TYPES.ObjectExpression) {
    return node.properties.some((property) => property.type === AST_NODE_TYPES.SpreadElement);
  }
  if (node.type === AST_NODE_TYPES.NewExpression) {
    return (
      node.callee.type === AST_NODE_TYPES.Identifier && COPY_CONSTRUCTORS.has(node.callee.name)
    );
  }
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  if (isObjectAssign(node)) {
    return node.arguments[0]?.type === AST_NODE_TYPES.ObjectExpression;
  }
  const name = calleeName(node);
  return name !== undefined && (COPY_METHODS.has(name) || COPY_FUNCTIONS.has(name));
}

export function isReassignedToCopy(variable: Variable, mutation: Ranged): boolean {
  return variable.references.some(
    (reference) =>
      reference.isWrite() &&
      reference.writeExpr !== undefined &&
      reference.writeExpr !== null &&
      reference.identifier.range[0] < mutation.range[0] &&
      isCopy(reference.writeExpr),
  );
}
