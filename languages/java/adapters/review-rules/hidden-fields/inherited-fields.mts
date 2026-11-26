import { classChain } from '../type-declarations/type-index.mts';
import type { TypeIndex } from '../type-declarations/type-index.mts';
import type { FieldDecl, TypeDecl } from '../type-declarations/types.mts';

export type Inherited = { readonly field: FieldDecl; readonly owner: TypeDecl };

function visibleFrom(field: FieldDecl, below: readonly TypeDecl[], owner: TypeDecl): boolean {
  const { modifiers } = field;
  if (modifiers.has('static') || modifiers.has('private')) {
    return false;
  }
  const packaged = !(modifiers.has('public') || modifiers.has('protected'));
  return !packaged || below.every(({ pkg }) => pkg === owner.pkg);
}

export function inheritedFields(type: TypeDecl, index: TypeIndex): Map<string, Inherited> {
  const chain = classChain(type, index);
  const seen = new Set<string>();
  const found = chain.slice(1).flatMap((owner, at) => {
    const fresh = owner.fields.filter(({ name }) => !seen.has(name));
    for (const { name } of fresh) {
      seen.add(name);
    }
    return fresh
      .filter((field) => visibleFrom(field, chain.slice(0, at + 1), owner))
      .map((field): [string, Inherited] => [field.name, { field, owner }]);
  });
  return new Map(found);
}
