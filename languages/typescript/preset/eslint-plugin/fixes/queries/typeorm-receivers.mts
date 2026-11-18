import type { TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { typeServices, type Context } from '../../rules/security/security-values.mts';
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

export function hasMember(context: Context, receiver: TSESTree.Node, name: string): boolean {
  const services = typeServices(context);
  if (services === undefined) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const type = checker.getNonNullableType(services.getTypeAtLocation(receiver));
  return checker.getPropertyOfType(type, name) !== undefined;
}
