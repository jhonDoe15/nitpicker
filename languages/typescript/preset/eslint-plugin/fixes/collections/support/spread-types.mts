import type { TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { typeServices, type Context } from '../../../rules/security/security-values.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';
import { ts } from '../../../rules/typed/typescript-views.mts';

const SPREADABLE_FLAGS =
  ts.TypeFlags.Any |
  ts.TypeFlags.NonPrimitive |
  ts.TypeFlags.Object |
  ts.TypeFlags.InstantiableNonPrimitive;

function isFalsyLiteral(type: TypeScript.Type): boolean {
  if ((type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0) {
    return true;
  }
  if (type.isStringLiteral()) {
    return type.value === '';
  }
  if (type.isNumberLiteral()) {
    return type.value === 0;
  }
  if (type.isLiteral() && (type.flags & ts.TypeFlags.BigIntLiteral) !== 0) {
    const { value } = type;
    return typeof value === 'object' && value.base10Value === '0';
  }
  return (
    (type.flags & ts.TypeFlags.BooleanLiteral) !== 0 &&
    'intrinsicName' in type &&
    type.intrinsicName === 'false'
  );
}

function unionMembers(types: readonly TypeScript.Type[]): TypeScript.Type[] {
  const pending = [...types];
  const members: TypeScript.Type[] = [];
  for (const type of pending) {
    if (type.isUnion()) {
      appendAll(pending, type.types);
    } else {
      members.push(type);
    }
  }
  return members;
}

function isSpreadableLeaf(type: TypeScript.Type): boolean {
  const pending = [type];
  for (const current of pending) {
    if (current.isUnionOrIntersection()) {
      appendAll(pending, current.types);
    } else if ((current.flags & SPREADABLE_FLAGS) === 0) {
      return false;
    }
  }
  return true;
}

function isSpreadableType(checker: TypeScript.TypeChecker, type: TypeScript.Type): boolean {
  const constrained = unionMembers(
    unionMembers([type]).map((member) => checker.getBaseConstraintOfType(member) ?? member),
  );
  const remaining = constrained.filter((member) => !isFalsyLiteral(member));
  return remaining.length > 0 && remaining.every(isSpreadableLeaf);
}

export function canSpreadValue(context: Context, node: TSESTree.Node): boolean {
  const services = typeServices(context);
  return (
    services !== undefined &&
    isSpreadableType(services.program.getTypeChecker(), services.getTypeAtLocation(node))
  );
}
