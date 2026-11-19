import type { TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { arrayItemTypes, itemTypesOf, unionMembers } from '../../../rules/support/array-items.mts';
import { hasArrayType } from '../../../rules/support/checked-types.mts';
import { typeServices, type Context } from '../../../rules/security/security-values.mts';
import { ts } from '../../../rules/typed/typescript-views.mts';

const NEVER_OBJECT_FLAGS =
  ts.TypeFlags.StringLike |
  ts.TypeFlags.NumberLike |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.BigIntLike |
  ts.TypeFlags.ESSymbolLike |
  ts.TypeFlags.Null |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Void;
const MAYBE_HOLE_FLAGS = ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Unknown;

function mayBeHole(type: TypeScript.Type): boolean {
  return unionMembers(type).some((member) => (member.flags & MAYBE_HOLE_FLAGS) !== 0);
}

export function hasDenseArrayType(context: Context, node: TSESTree.Node): boolean {
  if (hasArrayType(context, node) !== 'yes') {
    return false;
  }
  const typed = arrayItemTypes(context, node);
  return typed !== undefined && !typed.items.some(mayBeHole);
}

export function isPrimitiveKey(context: Context, node: TSESTree.Node): boolean {
  const services = typeServices(context);
  if (services === undefined) {
    return false;
  }
  return unionMembers(services.getTypeAtLocation(node)).every(
    (member) => (member.flags & NEVER_OBJECT_FLAGS) !== 0,
  );
}

const NULLISH_FLAGS = ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void;

export function hasDenseDefiniteArrayType(context: Context, node: TSESTree.Node): boolean {
  const services = typeServices(context);
  return (
    services !== undefined &&
    !unionMembers(services.getTypeAtLocation(node)).some(
      (member) => (member.flags & NULLISH_FLAGS) !== 0,
    ) &&
    hasDenseArrayType(context, node)
  );
}

function isPlainConcatMember(
  checker: TypeScript.TypeChecker,
  member: TypeScript.Type,
  arrays: boolean,
): boolean {
  if ((member.flags & NEVER_OBJECT_FLAGS) !== 0) {
    return true;
  }
  if (checker.isArrayType(member) || checker.isTupleType(member)) {
    return arrays && !(itemTypesOf(checker, member) ?? [member]).some(mayBeHole);
  }
  return (
    (member.flags & ts.TypeFlags.Object) !== 0 &&
    checker.getIndexTypeOfType(member, ts.IndexKind.Number) === undefined &&
    !member.getProperties().some((property) => property.getName().includes('isConcatSpreadable'))
  );
}

function isPlainConcatValue(context: Context, node: TSESTree.Node, arrays: boolean): boolean {
  const services = typeServices(context);
  if (services === undefined) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  return unionMembers(services.getTypeAtLocation(node)).every((member) =>
    isPlainConcatMember(checker, member, arrays),
  );
}

export function isPlainConcatArgument(context: Context, node: TSESTree.Node): boolean {
  return isPlainConcatValue(context, node, true);
}

export function isAppendedAsOne(context: Context, node: TSESTree.Node): boolean {
  return isPlainConcatValue(context, node, false);
}

export function hasMethod(context: Context, node: TSESTree.Node, name: string): boolean {
  const services = typeServices(context);
  if (services === undefined) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const type = checker.getNonNullableType(services.getTypeAtLocation(node));
  return checker.getPropertyOfType(type, name) !== undefined;
}

export function hasObjectFromEntries(context: Context, node: TSESTree.Node): boolean {
  const services = typeServices(context);
  const tsNode = services?.esTreeNodeToTSNodeMap.get(node);
  if (services === undefined || tsNode === undefined) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const symbol = checker
    .getSymbolsInScope(tsNode, ts.SymbolFlags.Variable)
    .find((candidate) => candidate.getName() === 'Object');
  return (
    symbol !== undefined &&
    checker.getPropertyOfType(checker.getTypeOfSymbol(symbol), 'fromEntries') !== undefined
  );
}
