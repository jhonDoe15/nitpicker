import type TypeScript from 'typescript';
import { ts } from '../../rules/typed/typescript-views.mts';

const OWNERS = new Map([
  ['Repository', 0],
  ['EntityManager', 1],
]);

export function ownerIndex(declaration: TypeScript.Node | undefined): number | undefined {
  const owner = declaration?.parent;
  const name = owner !== undefined && ts.isClassDeclaration(owner) ? owner.name?.text : undefined;
  return name === undefined ? undefined : OWNERS.get(name);
}
