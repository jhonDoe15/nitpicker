import type TypeScript from 'typescript';
import { ts } from '../typed/typescript-views.mts';
import { isUnconstrained } from '../presence/value-facts.mts';
import { partsOf } from '../analysis/narrowing/type-parts.mts';

const NULLISH = ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void;
const STRING = ts.TypeFlags.String;
const NON_EMPTY_STRING = ts.TypeFlags.StringLiteral;
const BOOLEAN = ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral;

function canBeFalsy(part: TypeScript.Type, checker: TypeScript.TypeChecker): boolean {
  if ((part.flags & STRING) !== 0) {
    return true;
  }
  if ((part.flags & NON_EMPTY_STRING) !== 0) {
    return part.isStringLiteral() && part.value === '';
  }
  if ((part.flags & BOOLEAN) !== 0) {
    return (
      (part.flags & ts.TypeFlags.BooleanLiteral) === 0 || checker.typeToString(part) === 'false'
    );
  }
  return isUnconstrained(part, checker);
}

function isPlainPart(part: TypeScript.Type, checker: TypeScript.TypeChecker): boolean {
  return (
    (part.flags & (STRING | NON_EMPTY_STRING | BOOLEAN)) !== 0 || isUnconstrained(part, checker)
  );
}

/**
 * Whether `type` is a string, a boolean or an unconstrained type parameter that may be missing
 * (`string | undefined`, `boolean | null`, `T`), where `''` or `false` reads like the missing case.
 */
export function isPresenceType(type: TypeScript.Type, checker: TypeScript.TypeChecker): boolean {
  const parts = partsOf(type);
  const present = parts.filter((part) => (part.flags & NULLISH) === 0);
  const isMissable =
    present.length < parts.length || present.some((part) => isUnconstrained(part, checker));
  return (
    isMissable &&
    present.length > 0 &&
    present.every((part) => isPlainPart(part, checker)) &&
    present.some((part) => canBeFalsy(part, checker))
  );
}

export function isPresenceElement(
  arrayType: TypeScript.Type,
  checker: TypeScript.TypeChecker,
): boolean {
  const element = checker.getIndexTypeOfType(arrayType, ts.IndexKind.Number);
  return element !== undefined && isPresenceType(element, checker);
}

export function isBooleanOnly(type: TypeScript.Type): boolean {
  const present = partsOf(type).filter((part) => (part.flags & NULLISH) === 0);
  return present.length > 0 && present.every((part) => (part.flags & BOOLEAN) !== 0);
}
