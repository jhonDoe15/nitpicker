import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { wordsOf as untypedWordsOf } from '../../../../../../../shared/naming/secret-words.mjs';
import {
  firstString,
  type CallChain,
  type ChainStep,
  type OrmKind,
  type OrmSite,
} from './chains.mts';
import { tableKey } from './table-names.mts';

const wordsOf: (name: string) => string[] = untypedWordsOf;

const INSERT = 'insert';
const UPDATE = 'update';
const DELETE = 'delete';
const WRITE = 'write';
const DRIZZLE = 'drizzle';
const KYSELY = 'kysely';
const TYPEORM = 'typeorm';

const CLIENT_WORDS = new Set([
  'db',
  'tx',
  'trx',
  'txn',
  'knex',
  'database',
  'connection',
  'conn',
  'transaction',
  KYSELY,
  'prisma',
  DRIZZLE,
]);
const KYSELY_WRITE_STARTS = new Set([
  'insertInto',
  'updateTable',
  'deleteFrom',
  'replaceInto',
  'mergeInto',
]);
const KNEX_WRITES = new Set([
  INSERT,
  UPDATE,
  'del',
  DELETE,
  'upsert',
  'truncate',
  'increment',
  'decrement',
]);
const KNEX_TABLE_STEPS = new Set(['table', 'from', 'into']);
const DRIZZLE_WRITES = new Set([INSERT, UPDATE, DELETE]);
const DRIZZLE_READS = new Set(['select', 'selectDistinct']);
const DRIZZLE_FIND = new Set(['findFirst', 'findMany']);
const QUERY_BUILDER_WRITES = new Set([INSERT, UPDATE, DELETE, 'softDelete', 'restore']);
const QUERY_BUILDER_TABLES = new Set(['into', 'from', UPDATE]);
const QUERY_BUILDER_READS = new Set([
  'getMany',
  'getOne',
  'getRawMany',
  'getRawOne',
  'getManyAndCount',
  'getCount',
  'getExists',
  'getOneOrFail',
]);
const QUERY_BUILDER_FROM = new Set(['from']);
const REPOSITORY_WORDS = new Set(['repository', 'repo']);

type Recognizer = (chain: CallChain, kind: OrmKind) => OrmSite | undefined;

export function isClientName(name: string | undefined): boolean {
  return typeof name === 'string' && wordsOf(name).some((word) => CLIENT_WORDS.has(word));
}

export function stepIn(names: ReadonlySet<string>, step: ChainStep | undefined): boolean {
  return step?.name !== undefined && names.has(step.name);
}

function isTableArgument(node: TSESTree.Node | undefined): boolean {
  return (
    node?.type === AST_NODE_TYPES.Identifier ||
    (node?.type === AST_NODE_TYPES.MemberExpression && !node.computed)
  );
}

function tableOfArgument(node: TSESTree.Node | undefined): string | undefined {
  if (node?.type === AST_NODE_TYPES.Identifier) {
    return tableKey(node.name);
  }
  if (node?.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const { property } = node;
  const named =
    property.type === AST_NODE_TYPES.Identifier ||
    property.type === AST_NODE_TYPES.PrivateIdentifier;
  return tableKey(named ? property.name : undefined);
}

function kysely({ steps }: CallChain, kind: OrmKind): OrmSite | undefined {
  const start = steps.find((step) => step.args !== undefined && step.name === 'selectFrom');
  const write = steps.find((step) => stepIn(KYSELY_WRITE_STARTS, step));
  const step = kind === WRITE ? write : start;
  return step === undefined ? undefined : { orm: KYSELY, table: tableKey(firstString(step.args)) };
}

function drizzle({ root, steps }: CallChain, kind: OrmKind): OrmSite | undefined {
  const names = kind === WRITE ? DRIZZLE_WRITES : DRIZZLE_READS;
  const index = steps.findIndex((step) => stepIn(names, step) && step.args !== undefined);
  const previous = steps[index - 1];
  const owner = index <= 0 ? root : previous?.name;
  if (index === -1 || !isClientName(owner) || (index > 0 && previous?.args !== undefined)) {
    return undefined;
  }
  if (kind === WRITE) {
    const [table] = steps[index]?.args ?? [];
    return isTableArgument(table) ? { orm: DRIZZLE, table: tableOfArgument(table) } : undefined;
  }
  const from = steps
    .slice(index)
    .find((step) => step.name === 'from' && (step.args?.length ?? 0) > 0);
  return from === undefined ? undefined : { orm: DRIZZLE, table: tableOfArgument(from.args?.[0]) };
}

function drizzleFind({ steps }: CallChain): OrmSite | undefined {
  const index = steps.findIndex((step) => step.name === 'query' && step.args === undefined);
  const method = steps[index + 2];
  const isFind = index !== -1 && stepIn(DRIZZLE_FIND, method) && method?.args !== undefined;
  return isFind ? { orm: DRIZZLE, table: tableKey(steps[index + 1]?.name) } : undefined;
}

function knexTable(steps: readonly ChainStep[]): string | undefined {
  const step = steps.find(
    (each) =>
      each.args !== undefined &&
      firstString(each.args) !== undefined &&
      (stepIn(KNEX_TABLE_STEPS, each) || isClientName(each.name)),
  );
  return step === undefined ? undefined : tableKey(firstString(step.args));
}

function knex({ steps }: CallChain, kind: OrmKind): OrmSite | undefined {
  const writes = steps.some((step) => step.args !== undefined && stepIn(KNEX_WRITES, step));
  const table = knexTable(steps);
  const matches = kind === WRITE ? writes : !writes;
  return table !== undefined && matches ? { orm: 'knex', table } : undefined;
}

function builderOwnerTable(steps: readonly ChainStep[], index: number): string | undefined {
  const owner = steps[index - 1]?.name ?? '';
  const repository = wordsOf(owner).some((word) => REPOSITORY_WORDS.has(word));
  return repository ? tableKey(owner) : undefined;
}

function queryBuilderTable(
  steps: readonly ChainStep[],
  index: number,
  names: ReadonlySet<string>,
): string | undefined {
  const named = steps.find((step) => stepIn(names, step) && (step.args?.length ?? 0) > 0);
  const [first] = steps[index]?.args ?? [];
  const isEntity = first?.type === AST_NODE_TYPES.Identifier && /^[A-Z]/u.test(first.name);
  const table =
    named === undefined
      ? tableOfArgument(isEntity ? first : undefined)
      : tableOfArgument(named.args?.[0]);
  return table ?? builderOwnerTable(steps, index);
}

function queryBuilder({ steps }: CallChain, kind: OrmKind): OrmSite | undefined {
  const index = steps.findIndex((step) => step.name === 'createQueryBuilder');
  const last = steps.at(-1)?.name;
  const write = steps.findIndex(
    (step) => stepIn(QUERY_BUILDER_WRITES, step) && step.args !== undefined,
  );
  if (index === -1) {
    return undefined;
  }
  if (kind === 'read') {
    const isRead = last !== undefined && QUERY_BUILDER_READS.has(last) && write === -1;
    const table = isRead ? queryBuilderTable(steps, index, QUERY_BUILDER_FROM) : undefined;
    return table === undefined ? undefined : { orm: TYPEORM, table };
  }
  const executes = last === 'execute';
  return write > index && executes
    ? { orm: TYPEORM, table: queryBuilderTable(steps, index, QUERY_BUILDER_TABLES) }
    : undefined;
}

const BUILDERS: readonly (readonly [string, Recognizer])[] = [
  [KYSELY, kysely],
  [DRIZZLE, drizzle],
  [DRIZZLE, drizzleFind],
  ['knex', knex],
  [TYPEORM, queryBuilder],
];

export function builderSite(
  chain: CallChain,
  kind: OrmKind,
  orms: readonly string[],
): OrmSite | undefined {
  for (const [orm, recognize] of BUILDERS) {
    const site = orms.includes(orm) ? recognize(chain, kind) : undefined;
    if (site !== undefined) {
      return site;
    }
  }
  return undefined;
}
