import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { typeServices, unwrapped, type Context } from '../../../rules/security/security-values.mts';
import { arrayItemTypes } from '../../../rules/support/array-items.mts';
import { hasArrayType } from '../../../rules/support/checked-types.mts';
import { ts } from '../../../rules/typed/typescript-views.mts';
import { isGlobalName } from './globals.mts';

type Plain = {
  readonly owner: string;
  readonly name: string;
  readonly receiver: TSESTree.Expression;
};

const STATIC_RESULTS = new Map([
  ['Array', new Set(['from', 'of'])],
  ['Object', new Set(['entries', 'keys', 'values'])],
]);
const DENSE_METHODS = new Set(['flat', 'toReversed', 'toSorted', 'toSpliced', 'with']);
const COPYING_METHODS = new Set(['concat', 'slice']);
const HOLE_FLAGS =
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Void |
  ts.TypeFlags.Any |
  ts.TypeFlags.Unknown |
  ts.TypeFlags.TypeParameter;
const PRIMITIVE_FLAGS =
  ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike;

export function plainMethod(call: TSESTree.CallExpression): Plain | undefined {
  const { callee } = call;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    callee.optional ||
    call.optional ||
    callee.property.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  const { object } = callee;
  return {
    owner: object.type === AST_NODE_TYPES.Identifier ? object.name : '',
    name: callee.property.name,
    receiver: object,
  };
}

function mayBeHole(checker: TypeScript.TypeChecker, item: TypeScript.Type): boolean {
  const constraint = checker.getBaseConstraintOfType(item) ?? item;
  return [item, constraint].some((type) =>
    (type.isUnion() ? type.types : [type]).some((member) => (member.flags & HOLE_FLAGS) !== 0),
  );
}

function itemsMayBeHoles(context: Context, node: TSESTree.Node): boolean {
  const typed = arrayItemTypes(context, node);
  return typed === undefined || typed.items.some((item) => mayBeHole(typed.checker, item));
}

function isPrimitiveValue(context: Context, node: TSESTree.Node): boolean {
  const services = typeServices(context);
  const type = services?.getTypeAtLocation(node);
  return type !== undefined && (type.flags & PRIMITIVE_FLAGS) !== 0;
}

function isDenseArgument(context: Context, argument: TSESTree.CallExpressionArgument): boolean {
  if (argument.type === AST_NODE_TYPES.SpreadElement) {
    return false;
  }
  return hasArrayType(context, argument) === 'yes'
    ? !itemsMayBeHoles(context, argument)
    : isPrimitiveValue(context, argument);
}

function isDenseCopy(context: Context, call: TSESTree.CallExpression, plain: Plain): boolean {
  const argumentsDense =
    plain.name !== 'concat' ||
    call.arguments.every((argument) => isDenseArgument(context, argument));
  return argumentsDense && !itemsMayBeHoles(context, plain.receiver);
}

export function isFreshCall(context: Context, call: TSESTree.CallExpression): boolean {
  const plain = plainMethod(call);
  if (plain === undefined) {
    return false;
  }
  if (STATIC_RESULTS.get(plain.owner)?.has(plain.name) === true) {
    return isGlobalName(context, call, plain.owner);
  }
  const dense = DENSE_METHODS.has(plain.name);
  if (!dense && !COPYING_METHODS.has(plain.name)) {
    return false;
  }
  return (
    hasArrayType(context, plain.receiver) === 'yes' && (dense || isDenseCopy(context, call, plain))
  );
}

function isSizedArrayCall(node: TSESTree.CallExpression | TSESTree.NewExpression): boolean {
  const { callee, arguments: args } = node;
  return (
    callee.type === AST_NODE_TYPES.Identifier &&
    callee.name === 'Array' &&
    args.length === 1 &&
    args[0]?.type !== AST_NODE_TYPES.SpreadElement
  );
}

export function startsFromSizedArray(node: TSESTree.Node): boolean {
  let current = unwrapped(node);
  for (;;) {
    if (current.type === AST_NODE_TYPES.NewExpression) {
      return isSizedArrayCall(current);
    }
    if (current.type === AST_NODE_TYPES.CallExpression) {
      if (isSizedArrayCall(current)) {
        return true;
      }
      const callee = unwrapped(current.callee);
      if (callee.type !== AST_NODE_TYPES.MemberExpression) {
        return false;
      }
      current = unwrapped(callee.object);
    } else if (current.type === AST_NODE_TYPES.MemberExpression) {
      current = unwrapped(current.object);
    } else {
      return false;
    }
  }
}
