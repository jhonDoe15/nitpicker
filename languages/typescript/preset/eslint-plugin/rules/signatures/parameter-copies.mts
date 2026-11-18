import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { Ranged } from '../typed/node-views.mts';
import { calleeNameOf } from '../typed/syntax-views.mts';

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

const CONTEXT_NAME = new RegExp(
  [
    '^(?:out|acc|accumulator|state|ctx|context|cache|builder|draft|results?|errors|diagnostics)$',
    '(?:State|Context|Cache|Builder)$',
  ].join('|'),
  'u',
);
const FILLING_FUNCTION = /^(?:resolve|normali[sz]e|sanitize|apply|fill)/iu;
const OPTION_NAME = /^(?:config|options|opts)$/u;
const DEFAULTING_OPERATORS = new Set(['??=', '||=']);

export function calleeName(call: TSESTree.CallExpression): string | undefined {
  return calleeNameOf(call.callee);
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

export function isObjectDefine(call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'Object' &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    (callee.property.name === 'defineProperty' || callee.property.name === 'defineProperties')
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

function typeName(name: TSESTree.BindingName): string | undefined {
  const annotation = name.typeAnnotation?.typeAnnotation;
  return annotation?.type === AST_NODE_TYPES.TSTypeReference &&
    annotation.typeName.type === AST_NODE_TYPES.Identifier
    ? annotation.typeName.name
    : undefined;
}

export function isContextParameter(name: TSESTree.BindingName): boolean {
  const written = name.type === AST_NODE_TYPES.Identifier ? name.name : '';
  return CONTEXT_NAME.test(written) || CONTEXT_NAME.test(typeName(name) ?? '');
}

function ownerName(owner: TSESTree.Node): string | undefined {
  if (owner.type === AST_NODE_TYPES.FunctionDeclaration) {
    return owner.id?.name;
  }
  const holder = owner.parent;
  return holder?.type === AST_NODE_TYPES.VariableDeclarator &&
    holder.id.type === AST_NODE_TYPES.Identifier
    ? holder.id.name
    : undefined;
}

function rootName(node: TSESTree.Node): string | undefined {
  let current = node;
  while (current.type === AST_NODE_TYPES.MemberExpression) {
    current = current.object;
  }
  return current.type === AST_NODE_TYPES.Identifier ? current.name : undefined;
}

export function isDefaultFill(
  node: TSESTree.Node,
  parameter: TSESTree.BindingName,
  owner: TSESTree.Node,
): boolean {
  if (
    node.type !== AST_NODE_TYPES.AssignmentExpression ||
    !DEFAULTING_OPERATORS.has(node.operator)
  ) {
    return false;
  }
  const names = [
    rootName(node.left),
    parameter.type === AST_NODE_TYPES.Identifier ? parameter.name : '',
  ];
  return (
    names.some((name) => OPTION_NAME.test(name ?? '')) &&
    FILLING_FUNCTION.test(ownerName(owner) ?? '')
  );
}

export function isReassignedFromCall(
  node: TSESTree.CallExpression,
  argument: TSESTree.Node,
): boolean {
  const holder = node.parent;
  return (
    holder.type === AST_NODE_TYPES.AssignmentExpression &&
    holder.right === node &&
    holder.left.type === AST_NODE_TYPES.Identifier &&
    argument.type === AST_NODE_TYPES.Identifier &&
    holder.left.name === argument.name
  );
}
