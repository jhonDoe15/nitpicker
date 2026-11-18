import type { TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { packageFromPath } from '../../support/io/packages.mts';
import {
  ormFamilyOf,
  DRIZZLE,
  MIKRO_ORM,
  SEQUELIZE,
  TYPEORM,
} from '../../database/orm-modules.mts';
import { typeServices, type Context } from '../../security/security-values.mts';

export type CalleeOrigin = 'orm' | 'foreign' | 'unknown';

export const PRISMA = 'prisma';

type Family = typeof TYPEORM | typeof SEQUELIZE | typeof MIKRO_ORM | typeof DRIZZLE | typeof PRISMA;

const PRISMA_PACKAGES = new Set(['@prisma/client', '.prisma/client']);
const PRISMA_RUNTIME = '@prisma/client/runtime';
const FAMILIES = new Set<string>([TYPEORM, SEQUELIZE, MIKRO_ORM, DRIZZLE, PRISMA]);

function isFamily(name: string | undefined): name is Family {
  return name !== undefined && FAMILIES.has(name);
}

function packageFamily(name: string): Family | undefined {
  const family = PRISMA_PACKAGES.has(name) ? PRISMA : ormFamilyOf(name);
  return isFamily(family) ? family : undefined;
}

export function calleeDeclaration(
  context: Context,
  call: TSESTree.CallExpression,
): TypeScript.Node | undefined {
  const services = typeServices(context);
  if (services === undefined) {
    return undefined;
  }
  const node = services.esTreeNodeToTSNodeMap.get(call);
  return services.program.getTypeChecker().getResolvedSignature(node)?.declaration;
}

export function calleeFamily(context: Context, call: TSESTree.CallExpression): Family | undefined {
  const file = calleeDeclaration(context, call)?.getSourceFile();
  if (file === undefined) {
    return undefined;
  }
  const name = packageFromPath(file.fileName);
  if (name !== undefined) {
    return packageFamily(name);
  }
  return file.text.includes(PRISMA_RUNTIME) ? PRISMA : undefined;
}

export function calleeOrigin(context: Context, call: TSESTree.CallExpression): CalleeOrigin {
  if (calleeDeclaration(context, call) === undefined) {
    return 'unknown';
  }
  return calleeFamily(context, call) === undefined ? 'foreign' : 'orm';
}

export function isForeignCall(context: Context, call: TSESTree.CallExpression): boolean {
  return calleeOrigin(context, call) === 'foreign';
}
