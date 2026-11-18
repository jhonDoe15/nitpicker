import type TypeScript from 'typescript';
import { partsOf } from '../analysis/narrowing/type-parts.mts';
import { ts } from '../typed/typescript-views.mts';

const UNDEFINED = ts.TypeFlags.Undefined | ts.TypeFlags.Void;

export function includesUndefined(type: TypeScript.Type): boolean {
  return partsOf(type).some((part) => (part.flags & UNDEFINED) !== 0);
}

export function isOnlyUndefined(type: TypeScript.Type): boolean {
  return partsOf(type).every((part) => (part.flags & UNDEFINED) !== 0);
}
