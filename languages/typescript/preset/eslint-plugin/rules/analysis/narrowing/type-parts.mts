import type TypeScript from 'typescript';

export function partsOf(type: TypeScript.Type): readonly TypeScript.Type[] {
  return type.isUnion() ? type.types : [type];
}
