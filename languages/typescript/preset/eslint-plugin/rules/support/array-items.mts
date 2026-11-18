import type { TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { typeServices, type Context } from '../security/security-values.mts';
import { ts } from '../typed/typescript-views.mts';
import type { TypeAnswer } from './checked-types.mts';

const FALSY_FLAGS =
  ts.TypeFlags.Any |
  ts.TypeFlags.Unknown |
  ts.TypeFlags.Never |
  ts.TypeFlags.Void |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Null |
  ts.TypeFlags.StringLike |
  ts.TypeFlags.NumberLike |
  ts.TypeFlags.BigIntLike |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.EnumLike |
  ts.TypeFlags.TypeParameter |
  ts.TypeFlags.Index |
  ts.TypeFlags.IndexedAccess |
  ts.TypeFlags.Conditional |
  ts.TypeFlags.Substitution;

const OBJECT_FLAGS = ts.TypeFlags.Object | ts.TypeFlags.NonPrimitive;

function unionMembers(type: TypeScript.Type): readonly TypeScript.Type[] {
  return type.isUnion() ? type.types : [type];
}

export function itemTypesOf(
  checker: TypeScript.TypeChecker,
  member: TypeScript.Type,
): readonly TypeScript.Type[] | undefined {
  if (checker.isTupleType(member)) {
    return checker.getTypeArguments(member as TypeScript.TypeReference);
  }
  if (!checker.isArrayType(member)) {
    return undefined;
  }
  const item = checker.getIndexTypeOfType(member, ts.IndexKind.Number);
  return item === undefined ? undefined : [item];
}

export function arrayItemTypes(
  context: Context,
  node: TSESTree.Node,
):
  | { readonly checker: TypeScript.TypeChecker; readonly items: readonly TypeScript.Type[] }
  | undefined {
  const services = typeServices(context);
  if (services === undefined) {
    return undefined;
  }
  const checker = services.program.getTypeChecker();
  const items: TypeScript.Type[] = [];
  for (const member of unionMembers(checker.getNonNullableType(services.getTypeAtLocation(node)))) {
    const found = itemTypesOf(checker, member);
    if (found === undefined) {
      return undefined;
    }
    for (const item of found) {
      items.push(item);
    }
  }
  return { checker, items };
}

function falsyValues(checker: TypeScript.TypeChecker): readonly TypeScript.Type[] {
  return [
    checker.getStringLiteralType(''),
    checker.getNumberLiteralType(0),
    checker.getFalseType(),
    checker.getBigIntType(),
    checker.getNullType(),
    checker.getUndefinedType(),
  ];
}

function isObjectMember(checker: TypeScript.TypeChecker, type: TypeScript.Type): boolean {
  const member = checker.getBaseConstraintOfType(type) ?? type;
  return (
    (member.flags & FALSY_FLAGS) === 0 &&
    (member.flags & OBJECT_FLAGS) !== 0 &&
    !falsyValues(checker).some((value) => checker.isTypeAssignableTo(value, member))
  );
}

export function isNeverFalsyObject(
  checker: TypeScript.TypeChecker,
  type: TypeScript.Type,
): boolean {
  const members = unionMembers(type);
  return members.length > 0 && members.every((member) => isObjectMember(checker, member));
}

export function hasNeverFalsyItems(context: Context, node: TSESTree.Node): TypeAnswer {
  const typed = arrayItemTypes(context, node);
  if (typed === undefined) {
    return typeServices(context) === undefined ? 'unknown' : 'no';
  }
  const { checker, items } = typed;
  return items.length > 0 && items.every((item) => isNeverFalsyObject(checker, item))
    ? 'yes'
    : 'no';
}

export function hasSingleType(context: Context, node: TSESTree.Node): boolean {
  const services = typeServices(context);
  return services !== undefined && !services.getTypeAtLocation(node).isUnion();
}

export function hasSingleItemType(context: Context, node: TSESTree.Node): boolean {
  const typed = arrayItemTypes(context, node);
  const [item] = typed?.items ?? [];
  return typed?.items.length === 1 && item !== undefined && !item.isUnion();
}
