import type { TSESTree } from '@typescript-eslint/utils';
import { packageFromPath } from '../../support/io/packages.mts';
import { isOrmModule } from '../../database/orm-modules.mts';
import { typeServices, type Context } from '../../security/security-values.mts';

export type CalleeOrigin = 'orm' | 'foreign' | 'unknown';

const PRISMA_PACKAGES = new Set(['@prisma/client', '.prisma/client']);
const PRISMA_RUNTIME = '@prisma/client/runtime';

function isOrmPackage(name: string): boolean {
  return isOrmModule(name) || PRISMA_PACKAGES.has(name);
}

export function calleeOrigin(context: Context, call: TSESTree.CallExpression): CalleeOrigin {
  const services = typeServices(context);
  if (services === undefined) {
    return 'unknown';
  }
  const node = services.esTreeNodeToTSNodeMap.get(call);
  const declaration = services.program.getTypeChecker().getResolvedSignature(node)?.declaration;
  if (declaration === undefined) {
    return 'unknown';
  }
  const file = declaration.getSourceFile();
  const name = packageFromPath(file.fileName);
  if (name !== undefined) {
    return isOrmPackage(name) ? 'orm' : 'foreign';
  }
  return file.text.includes(PRISMA_RUNTIME) ? 'orm' : 'foreign';
}

export function isForeignCall(context: Context, call: TSESTree.CallExpression): boolean {
  return calleeOrigin(context, call) === 'foreign';
}
