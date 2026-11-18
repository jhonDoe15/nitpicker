import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { typeServices, type Context } from '../../../rules/security/security-values.mts';
import { calleeDeclaration } from '../../../rules/support/io/implementations.mts';
import { packageFromPath } from '../../../rules/support/io/packages.mts';
import { isReference, ts } from '../../../rules/typed/typescript-views.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';
import { packageVersion } from './project-files.mts';
import { TYPEORM_PACKAGES } from './typeorm-columns.mts';

export type Orm = 'typeorm' | 'prisma' | 'ioredis' | 'node-redis';

export type OrmCall = {
  readonly orm: Orm;
  readonly pkg: string;
  readonly version: string | undefined;
  readonly method: string;
  readonly receiver: TSESTree.Expression;
  readonly entity: TypeScript.Type | undefined;
  readonly model: string | undefined;
  readonly declarationFile: string;
};

type Declared = { readonly file: string; readonly pkg: string; readonly owner: string | undefined };

const PRISMA_PACKAGES = new Set(['.prisma/client', '@prisma/client']);
const REDIS_PACKAGES = new Set(['@redis/client', 'redis']);
const NODE_REDIS_COMMANDS = /\/client\/commands\.d\.ts$/u;
const MAX_BASES = 12;

function ownerOf(declaration: TypeScript.Declaration): string | undefined {
  const container = declaration.parent;
  const named = ts.isClassLike(container) || ts.isInterfaceDeclaration(container);
  return named ? container.name?.text : undefined;
}

function declaredPackage(type: TypeScript.Type): string | undefined {
  const file = type.getSymbol()?.declarations?.[0]?.getSourceFile().fileName;
  return file === undefined ? undefined : packageFromPath(file);
}

function repositoryEntity(
  checker: TypeScript.TypeChecker,
  start: TypeScript.Type,
): TypeScript.Type | undefined {
  const pending = [checker.getNonNullableType(start)];
  for (const type of pending) {
    const pkg = declaredPackage(type);
    if (type.getSymbol()?.name === 'Repository' && pkg !== undefined && TYPEORM_PACKAGES.has(pkg)) {
      return isReference(type) ? checker.getTypeArguments(type)[0] : undefined;
    }
    if (pending.length < MAX_BASES && type.isClassOrInterface()) {
      appendAll(pending, checker.getBaseTypes(type));
    }
  }
  return undefined;
}

function isNamedClient(
  type: TypeScript.Type,
  name: string,
  packages: ReadonlySet<string>,
): boolean {
  const pkg = declaredPackage(type);
  return type.getSymbol()?.name === name && pkg !== undefined && packages.has(pkg);
}

function declaredOf(
  context: Context,
  call: TSESTree.CallExpression,
): { readonly declared: Declared; readonly method: string } | undefined {
  const services = typeServices(context);
  const tsCall = services?.esTreeNodeToTSNodeMap.get(call);
  if (services === undefined || tsCall === undefined || !ts.isCallExpression(tsCall)) {
    return undefined;
  }
  const callee = tsCall.expression;
  if (!ts.isPropertyAccessExpression(callee)) {
    return undefined;
  }
  const declaration = calleeDeclaration(services.program.getTypeChecker(), callee.name);
  const file = declaration?.getSourceFile().fileName;
  const pkg = file === undefined ? undefined : packageFromPath(file);
  if (declaration === undefined || file === undefined || pkg === undefined) {
    return undefined;
  }
  return { declared: { file, pkg, owner: ownerOf(declaration) }, method: callee.name.text };
}

type Found = Pick<OrmCall, 'orm' | 'entity' | 'model'>;

function typeormFound(context: Context, receiver: TSESTree.Expression): Found | undefined {
  const services = typeServices(context);
  if (services === undefined) {
    return undefined;
  }
  const entity = repositoryEntity(
    services.program.getTypeChecker(),
    services.getTypeAtLocation(receiver),
  );
  return entity === undefined ? undefined : { orm: 'typeorm', entity, model: undefined };
}

function prismaFound(
  context: Context,
  receiver: TSESTree.Expression,
  owner: string,
): Found | undefined {
  const services = typeServices(context);
  if (
    services === undefined ||
    receiver.type !== AST_NODE_TYPES.MemberExpression ||
    receiver.computed
  ) {
    return undefined;
  }
  const client = services.getTypeAtLocation(receiver.object);
  const plain = isNamedClient(client, 'PrismaClient', PRISMA_PACKAGES);
  return plain
    ? { orm: 'prisma', entity: undefined, model: owner.slice(0, -'Delegate'.length) }
    : undefined;
}

function redisFound(
  context: Context,
  receiver: TSESTree.Expression,
  pkg: string,
): Found | undefined {
  const services = typeServices(context);
  if (services === undefined) {
    return undefined;
  }
  const type = services.program
    .getTypeChecker()
    .getNonNullableType(services.getTypeAtLocation(receiver));
  const plain = pkg === 'ioredis' && isNamedClient(type, 'Redis', new Set([pkg]));
  return plain ? { orm: 'ioredis', entity: undefined, model: undefined } : undefined;
}

function foundOf(
  context: Context,
  receiver: TSESTree.Expression,
  { file, pkg, owner }: Declared,
): Found | undefined {
  if (TYPEORM_PACKAGES.has(pkg) && owner === 'Repository') {
    return typeormFound(context, receiver);
  }
  if (PRISMA_PACKAGES.has(pkg) && owner?.endsWith('Delegate') === true) {
    return prismaFound(context, receiver, owner);
  }
  if (pkg === 'ioredis') {
    return redisFound(context, receiver, pkg);
  }
  const isClientCommand =
    REDIS_PACKAGES.has(pkg) && NODE_REDIS_COMMANDS.test(file.replaceAll('\\', '/'));
  return isClientCommand ? { orm: 'node-redis', entity: undefined, model: undefined } : undefined;
}

export function ormCall(context: Context, call: TSESTree.CallExpression): OrmCall | undefined {
  const { callee } = call;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return undefined;
  }
  const site = declaredOf(context, call);
  const found = site === undefined ? undefined : foundOf(context, callee.object, site.declared);
  if (site === undefined || found === undefined) {
    return undefined;
  }
  const { file, pkg } = site.declared;
  return {
    ...found,
    pkg,
    method: site.method,
    receiver: callee.object,
    declarationFile: file,
    version: packageVersion(file, found.orm === 'prisma' ? '@prisma/client' : pkg),
  };
}
