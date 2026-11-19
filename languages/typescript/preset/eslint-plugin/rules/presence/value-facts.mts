import type TypeScript from 'typescript';
import { partsOf } from '../analysis/narrowing/type-parts.mts';
import { ts } from '../typed/typescript-views.mts';

const UNDEFINED = ts.TypeFlags.Undefined | ts.TypeFlags.Void;
const NULLISH = UNDEFINED | ts.TypeFlags.Null;
const UNKNOWN = ts.TypeFlags.Unknown;
const WIDE_FALSY = ts.TypeFlags.String | ts.TypeFlags.Number | ts.TypeFlags.BigInt;

export function includesUndefined(type: TypeScript.Type): boolean {
  return partsOf(type).some((part) => (part.flags & UNDEFINED) !== 0);
}

export function includesNullish(type: TypeScript.Type): boolean {
  return partsOf(type).some((part) => (part.flags & (NULLISH | UNKNOWN)) !== 0);
}

export function isUnconstrained(part: TypeScript.Type, checker: TypeScript.TypeChecker): boolean {
  const constraint = checker.getBaseConstraintOfType(part);
  return (
    (part.flags & ts.TypeFlags.TypeParameter) !== 0 &&
    (constraint === undefined || (constraint.flags & ts.TypeFlags.Unknown) !== 0)
  );
}

function isFalsyLiteral(part: TypeScript.Type, checker: TypeScript.TypeChecker): boolean {
  if (part.isStringLiteral()) {
    return part.value === '';
  }
  if (part.isNumberLiteral()) {
    return part.value === 0;
  }
  return (part.flags & ts.TypeFlags.BooleanLiteral) !== 0 && checker.typeToString(part) === 'false';
}

export function canBeFalsy(type: TypeScript.Type, checker: TypeScript.TypeChecker): boolean {
  return partsOf(type).some(
    (part) =>
      (part.flags & (NULLISH | UNKNOWN | WIDE_FALSY)) !== 0 ||
      isFalsyLiteral(part, checker) ||
      isUnconstrained(part, checker),
  );
}

export function isWidePrimitive(type: TypeScript.Type, checker: TypeScript.TypeChecker): boolean {
  return partsOf(type).every(
    (part) =>
      (part.flags & WIDE_FALSY) !== 0 ||
      ((part.isStringLiteral() || part.isNumberLiteral()) && !isFalsyLiteral(part, checker)),
  );
}

export function isOnlyUndefined(type: TypeScript.Type): boolean {
  return partsOf(type).every((part) => (part.flags & UNDEFINED) !== 0);
}

export function includesUndefinedOrUnknown(type: TypeScript.Type): boolean {
  return partsOf(type).some((part) => (part.flags & (UNDEFINED | UNKNOWN)) !== 0);
}
