import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  memberChain,
  memberName,
  someNode,
} from '../../collections/costly-forms/repeated-runs.mts';
import { variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import { isStaticMethodCall } from '../support/ast-walk.mts';
import type { Repeat } from '../support/loop-invariance.mts';

export type CopyNode =
  | TSESTree.ArrayExpression
  | TSESTree.ObjectExpression
  | TSESTree.CallExpression
  | TSESTree.NewExpression;

const { DefinitionType } = TSESLint.Scope;

const ITERATION_CALLBACKS = new Set(['map', 'forEach', 'flatMap', 'reduce']);
const MUTATING_METHODS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
  'set',
  'add',
  'delete',
  'clear',
  'write',
]);
const SMALL_SIZE_LIMIT = 20;
const COMPARISON_OPERATORS = new Set(['<', '<=', '>', '>=']);

export function isObjectAssignTarget(node: TSESTree.Node): boolean {
  const { parent } = node;
  return (
    parent?.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments[0] === node &&
    isStaticMethodCall(parent, 'Object', 'assign')
  );
}

function isSmallBaseLiteral(node: TSESTree.Node): boolean {
  const expr = unwrapped(node);
  if (expr.type === AST_NODE_TYPES.Literal) {
    return true;
  }
  if (expr.type === AST_NODE_TYPES.ArrayExpression) {
    return (
      expr.elements.length <= SMALL_SIZE_LIMIT &&
      expr.elements.every((item) => item?.type !== AST_NODE_TYPES.SpreadElement)
    );
  }
  return (
    expr.type === AST_NODE_TYPES.ObjectExpression &&
    expr.properties.length <= SMALL_SIZE_LIMIT &&
    expr.properties.every((prop) => prop.type !== AST_NODE_TYPES.SpreadElement)
  );
}

function isSmallLiteralNode(node: TSESTree.Node): boolean {
  const expr = unwrapped(node);
  if (isSmallBaseLiteral(expr)) {
    return true;
  }
  if (
    expr.type === AST_NODE_TYPES.NewExpression &&
    expr.callee.type === AST_NODE_TYPES.Identifier &&
    (expr.callee.name === 'Map' || expr.callee.name === 'Set')
  ) {
    return (
      expr.arguments.length === 0 ||
      (expr.arguments[0] !== undefined && isSmallBaseLiteral(expr.arguments[0]))
    );
  }
  return false;
}

export function isSmallConstantValue(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const expr = unwrapped(node);
  if (isSmallLiteralNode(expr)) {
    return true;
  }
  if (expr.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const variable = variableNamed(sourceCode, expr);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (
    definition?.type !== DefinitionType.Variable ||
    definition.parent.kind !== 'const' ||
    definition.node.id.type !== AST_NODE_TYPES.Identifier ||
    definition.node.init === null
  ) {
    return false;
  }
  return isSmallLiteralNode(definition.node.init);
}

function isSmallNumericBound(test: TSESTree.Expression | null): boolean {
  if (test === null || test.type !== AST_NODE_TYPES.BinaryExpression) {
    return false;
  }
  if (!COMPARISON_OPERATORS.has(test.operator)) {
    return false;
  }
  const right = unwrapped(test.right);
  return (
    right.type === AST_NODE_TYPES.Literal &&
    typeof right.value === 'number' &&
    right.value <= SMALL_SIZE_LIMIT
  );
}

export function isSmallOrSkippedRepeat(sourceCode: SourceCode, repeat: Repeat): boolean {
  if (repeat.kind === 'loop') {
    if (repeat.node.type === AST_NODE_TYPES.ForOfStatement) {
      return isSmallConstantValue(sourceCode, repeat.node.right);
    }
    return (
      repeat.node.type === AST_NODE_TYPES.ForStatement && isSmallNumericBound(repeat.node.test)
    );
  }
  const call = repeat.node.parent;
  if (call?.type !== AST_NODE_TYPES.CallExpression) {
    return true;
  }
  const callee = unwrapped(call.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return true;
  }
  const name = memberName(callee);
  return (
    name === undefined ||
    !ITERATION_CALLBACKS.has(name) ||
    isSmallConstantValue(sourceCode, callee.object)
  );
}

function singleNonSpreadArg(
  args: readonly TSESTree.CallExpressionArgument[],
): TSESTree.Expression | undefined {
  if (args.length !== 1) {
    return undefined;
  }
  const first = args[0];
  return first !== undefined && first.type !== AST_NODE_TYPES.SpreadElement ? first : undefined;
}

function isZeroSliceCall(node: TSESTree.CallExpression): boolean {
  if (node.arguments.length === 0) {
    return true;
  }
  if (node.arguments.length !== 1) {
    return false;
  }
  const first = node.arguments[0];
  if (first === undefined) {
    return false;
  }
  const arg = unwrapped(first);
  return arg.type === AST_NODE_TYPES.Literal && arg.value === 0;
}

function callCopySource(node: TSESTree.CallExpression): TSESTree.Expression | undefined {
  const callee = unwrapped(node.callee);
  if (callee.type === AST_NODE_TYPES.Identifier && callee.name === 'structuredClone') {
    return singleNonSpreadArg(node.arguments);
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const method = memberName(callee);
  const owner = unwrapped(callee.object);
  if (method === 'slice' && isZeroSliceCall(node)) {
    return callee.object;
  }
  if (
    method === 'from' &&
    owner.type === AST_NODE_TYPES.Identifier &&
    (owner.name === 'Array' || owner.name === 'Buffer')
  ) {
    return singleNonSpreadArg(node.arguments);
  }
  return undefined;
}

export function copiedSourceOf(node: CopyNode): TSESTree.Expression | undefined {
  if (node.type === AST_NODE_TYPES.ArrayExpression) {
    const only = node.elements.length === 1 ? node.elements[0] : undefined;
    return only?.type === AST_NODE_TYPES.SpreadElement ? only.argument : undefined;
  }
  if (node.type === AST_NODE_TYPES.ObjectExpression) {
    const only = node.properties.length === 1 ? node.properties[0] : undefined;
    return only?.type === AST_NODE_TYPES.SpreadElement ? only.argument : undefined;
  }
  if (node.type === AST_NODE_TYPES.NewExpression) {
    const callee = unwrapped(node.callee);
    return callee.type === AST_NODE_TYPES.Identifier &&
      (callee.name === 'Map' || callee.name === 'Set')
      ? singleNonSpreadArg(node.arguments)
      : undefined;
  }
  return callCopySource(node);
}

export function rootIdentifierName(node: TSESTree.Node): string | undefined {
  const root = memberChain(node).at(-1);
  return root?.type === AST_NODE_TYPES.Identifier ? root.name : undefined;
}

function isMutatingCall(node: TSESTree.CallExpression, name: string): boolean {
  const callee = unwrapped(node.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const method = memberName(callee);
  return (
    method !== undefined &&
    MUTATING_METHODS.has(method) &&
    rootIdentifierName(callee.object) === name
  );
}

function isMutatingAccess(node: TSESTree.Node, name: string): boolean {
  if (node.type === AST_NODE_TYPES.AssignmentExpression) {
    return rootIdentifierName(node.left) === name;
  }
  if (node.type === AST_NODE_TYPES.UpdateExpression) {
    return rootIdentifierName(node.argument) === name;
  }
  if (node.type === AST_NODE_TYPES.UnaryExpression && node.operator === 'delete') {
    return rootIdentifierName(node.argument) === name;
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return isMutatingCall(node, name);
  }
  return (
    node.type === AST_NODE_TYPES.Identifier && node.name === name && isObjectAssignTarget(node)
  );
}

export function isMutatedInBoundary(name: string, boundary: TSESTree.Node): boolean {
  return someNode(boundary, (node) => isMutatingAccess(node, name));
}
