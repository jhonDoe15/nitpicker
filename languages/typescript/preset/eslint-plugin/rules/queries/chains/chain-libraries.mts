import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { stringValue } from '../../analysis/constant-resolution.mts';
import { DRIZZLE, type ModuleScope } from '../../database/orm-modules.mts';
import {
  memberName,
  typeServices,
  unwrapped,
  type Context,
} from '../../security/security-values.mts';

type MaybeNode = TSESTree.Node | undefined;

export const KYSELY = 'kysely';
export const KNEX = 'knex';
export const QUERY_BUILDER = 'query-builder';

export type Library = typeof KYSELY | typeof KNEX | typeof QUERY_BUILDER | typeof DRIZZLE;
export type ChainScope = ModuleScope & { readonly libraries: Set<Library> };

const LIBRARIES: readonly (readonly [Library, (source: string) => boolean])[] = [
  [KYSELY, (source) => source === 'kysely' || source.startsWith('kysely/')],
  [KNEX, (source) => source === 'knex'],
  [QUERY_BUILDER, (source) => ['typeorm', '@nestjs/typeorm'].includes(source)],
  [QUERY_BUILDER, (source) => source.startsWith('@mikro-orm/')],
  [DRIZZLE, (source) => source === 'drizzle-orm' || source.startsWith('drizzle-orm/')],
];
const IMPORTED_LIBRARIES: readonly Library[] = [DRIZZLE, KNEX];
const ROOT_TYPES = new Map<string, Library>([
  ['Kysely', KYSELY],
  ['Transaction', KYSELY],
  ['Knex', KNEX],
  ['Repository', QUERY_BUILDER],
  ['EntityManager', QUERY_BUILDER],
  ['DataSource', QUERY_BUILDER],
]);
const DRIZZLE_DATABASE = /^(?:\w+Database|PgTransaction|MySqlTransaction|SQLiteTransaction)$/u;
const SELECT_STEPS = new Set<string | undefined>([
  'select',
  'selectDistinct',
  'selectDistinctOn',
  'from',
  'distinct',
]);
const BUILTIN_ROOTS = new Set<string | undefined>([
  'Array',
  'Iterator',
  'Object',
  'Promise',
  'Buffer',
  'Observable',
  'Readable',
]);

export function libraryOf(source: string): Library | undefined {
  return LIBRARIES.find(([, matches]) => matches(source))?.[0];
}

function rootTypeName(context: Context, root: MaybeNode): string | undefined {
  const services = typeServices(context);
  if (services === undefined || root === undefined) {
    return undefined;
  }
  const type = services.getTypeAtLocation(root);
  return (type.getSymbol() ?? type.aliasSymbol)?.getName();
}

function typedLibrary(context: Context, root: MaybeNode): Library | undefined {
  const name = rootTypeName(context, root);
  if (name === undefined) {
    return undefined;
  }
  return ROOT_TYPES.get(name) ?? (DRIZZLE_DATABASE.test(name) ? DRIZZLE : undefined);
}

function rootName(root: MaybeNode): string | undefined {
  const target = unwrapped(root);
  if (target?.type === AST_NODE_TYPES.Identifier) {
    return target.name;
  }
  return target?.type === AST_NODE_TYPES.MemberExpression ? memberName(target) : undefined;
}

function isKnexCall(scope: ChainScope, root: MaybeNode): boolean {
  const call = root?.type === AST_NODE_TYPES.CallExpression ? root : undefined;
  const name = call === undefined ? undefined : rootName(call.callee);
  const table = call !== undefined && stringValue(unwrapped(call.arguments[0])) !== undefined;
  return name === 'knex' || (table && scope.libraries.has(KNEX) && call.arguments.length === 1);
}

function isKnexHandle(root: MaybeNode): boolean {
  return rootName(root) === 'knex';
}

function stepLibrary(
  scope: ChainScope,
  root: MaybeNode,
  names: ReadonlySet<string | undefined>,
): Library | undefined {
  if (names.has('selectFrom')) {
    return KYSELY;
  }
  if (names.has('createQueryBuilder')) {
    return QUERY_BUILDER;
  }
  if (isKnexHandle(root) && [...names].some((name) => SELECT_STEPS.has(name))) {
    return KNEX;
  }
  const imported = IMPORTED_LIBRARIES.find((library) => scope.libraries.has(library));
  return names.has('from') && !BUILTIN_ROOTS.has(rootName(root)) ? imported : undefined;
}

export function chainLibrary(
  scope: ChainScope,
  root: MaybeNode,
  names: ReadonlySet<string | undefined>,
): Library | undefined {
  if (isKnexCall(scope, root)) {
    return KNEX;
  }
  return stepLibrary(scope, root, names) ?? typedLibrary(scope.context, root);
}
