import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { unionMembers } from '../../rules/support/array-items.mts';
import { typeServices, type Context } from '../../rules/security/security-values.mts';
import { hasCommentIn, replacing, type FixPlan } from '../support/ranges.mts';
import { isFreshCall, plainMethod, startsFromSizedArray } from './support/fresh-arrays.mts';
import { isGlobalName } from './support/globals.mts';
import { isPresentValue } from './support/present-values.mts';

const PROMISE = 'Promise';
const COLLECTIONS = new Set(['Map', 'Set', 'WeakMap', 'WeakSet']);
const PROMISE_ARRAYS = new Set(['all', 'allSettled']);
const BARE_PARENTS = new Set<string>([
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ExpressionStatement,
  AST_NODE_TYPES.ArrayExpression,
  AST_NODE_TYPES.SpreadElement,
  AST_NODE_TYPES.AwaitExpression,
]);

function isFreshAwait(context: Context, value: TSESTree.AwaitExpression): boolean {
  const { argument } = value;
  const plain = argument.type === AST_NODE_TYPES.CallExpression ? plainMethod(argument) : undefined;
  return (
    plain?.owner === PROMISE &&
    PROMISE_ARRAYS.has(plain.name) &&
    isGlobalName(context, argument, PROMISE)
  );
}

function isFreshValue(context: Context, value: TSESTree.Node): boolean {
  if (value.type === AST_NODE_TYPES.ArrayExpression) {
    return value.elements.every((element) => element !== null);
  }
  if (value.type === AST_NODE_TYPES.AwaitExpression) {
    return isFreshAwait(context, value);
  }
  return value.type === AST_NODE_TYPES.CallExpression && isFreshCall(context, value);
}

function takesIterable(context: Context, array: TSESTree.ArrayExpression): boolean {
  const { parent } = array;
  if (parent.type === AST_NODE_TYPES.NewExpression) {
    const { callee } = parent;
    return (
      parent.arguments[0] === array &&
      callee.type === AST_NODE_TYPES.Identifier &&
      COLLECTIONS.has(callee.name) &&
      isGlobalName(context, callee, callee.name)
    );
  }
  const plain = parent.type === AST_NODE_TYPES.CallExpression ? plainMethod(parent) : undefined;
  if (parent.type !== AST_NODE_TYPES.CallExpression || plain === undefined) {
    return false;
  }
  const owners = new Map([
    ['Array', new Set(['from'])],
    [PROMISE, new Set(['all', 'allSettled', 'any', 'race'])],
  ]);
  return (
    parent.arguments.length === 1 &&
    parent.arguments[0] === array &&
    owners.get(plain.owner)?.has(plain.name) === true &&
    isGlobalName(context, parent, plain.owner)
  );
}

function isAsserted(array: TSESTree.ArrayExpression): boolean {
  const { type } = array.parent;
  return (
    type === AST_NODE_TYPES.TSAsExpression ||
    type === AST_NODE_TYPES.TSTypeAssertion ||
    type === AST_NODE_TYPES.TSSatisfiesExpression
  );
}

function isTupleValue(context: Context, value: TSESTree.Node): boolean {
  const services = typeServices(context);
  if (services === undefined) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const type = services.getTypeAtLocation(value);
  return unionMembers(type).some((member) => checker.isTupleType(member));
}

function isBareSlot(array: TSESTree.ArrayExpression): boolean {
  const { parent } = array;
  if (
    parent.type === AST_NODE_TYPES.CallExpression ||
    parent.type === AST_NODE_TYPES.NewExpression
  ) {
    return parent.arguments.includes(array);
  }
  if (parent.type === AST_NODE_TYPES.VariableDeclarator) {
    return parent.init === array;
  }
  if (parent.type === AST_NODE_TYPES.AssignmentExpression) {
    return parent.right === array;
  }
  if (parent.type === AST_NODE_TYPES.Property) {
    return parent.value === array;
  }
  if (parent.type === AST_NODE_TYPES.ArrowFunctionExpression) {
    return parent.body === array;
  }
  return BARE_PARENTS.has(parent.type);
}

function needsParentheses(array: TSESTree.ArrayExpression, value: TSESTree.Node): boolean {
  return value.type === AST_NODE_TYPES.AwaitExpression && !isBareSlot(array);
}

export function spreadCopyFix(
  context: Context,
  array: TSESTree.ArrayExpression,
  spread: TSESTree.SpreadElement,
): FixPlan | undefined {
  const { sourceCode } = context;
  const value = spread.argument;
  const isNewTarget =
    array.parent.type === AST_NODE_TYPES.NewExpression && array.parent.callee === array;
  if (
    isNewTarget ||
    isAsserted(array) ||
    startsFromSizedArray(value) ||
    hasCommentIn(sourceCode, array.range) ||
    isTupleValue(context, value)
  ) {
    return undefined;
  }
  const fresh = isFreshValue(context, value);
  if (!(fresh || (takesIterable(context, array) && isPresentValue(context, value)))) {
    return undefined;
  }
  const text = sourceCode.getText(value);
  return replacing(array.range, needsParentheses(array, value) ? `(${text})` : text);
}
