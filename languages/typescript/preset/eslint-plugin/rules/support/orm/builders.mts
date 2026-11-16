import { wordsOf } from '../../../../../../../shared/naming/secret-words.mjs';
import { firstString } from './chains.mts';
import { tableKey } from './table-names.mts';

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

export function isClientName(name) {
  return typeof name === 'string' && wordsOf(name).some((word) => CLIENT_WORDS.has(word));
}

function isTableArgument(node) {
  return node?.type === 'Identifier' || (node?.type === 'MemberExpression' && !node.computed);
}

function tableOfArgument(node) {
  if (node?.type === 'Identifier') {
    return tableKey(node.name);
  }
  return node?.type === 'MemberExpression' ? tableKey(node.property.name) : undefined;
}

function kysely({ steps }, kind) {
  const start = steps.find((step) => step.args !== undefined && step.name === 'selectFrom');
  const write = steps.find((step) => KYSELY_WRITE_STARTS.has(step.name));
  const step = kind === WRITE ? write : start;
  return step === undefined ? undefined : { orm: KYSELY, table: tableKey(firstString(step.args)) };
}

function drizzle({ root, steps }, kind) {
  const names = kind === WRITE ? DRIZZLE_WRITES : DRIZZLE_READS;
  const index = steps.findIndex((step) => names.has(step.name) && step.args !== undefined);
  const owner = index <= 0 ? root : steps[index - 1].name;
  if (index === -1 || !isClientName(owner) || (index > 0 && steps[index - 1].args !== undefined)) {
    return undefined;
  }
  if (kind === WRITE) {
    const [table] = steps[index].args;
    return isTableArgument(table) ? { orm: DRIZZLE, table: tableOfArgument(table) } : undefined;
  }
  const from = steps.slice(index).find((step) => step.name === 'from' && step.args?.length > 0);
  return from === undefined ? undefined : { orm: DRIZZLE, table: tableOfArgument(from.args[0]) };
}

function drizzleFind({ steps }) {
  const index = steps.findIndex((step) => step.name === 'query' && step.args === undefined);
  const method = steps[index + 2];
  const isFind = index !== -1 && DRIZZLE_FIND.has(method?.name) && method.args !== undefined;
  return isFind ? { orm: DRIZZLE, table: tableKey(steps[index + 1].name) } : undefined;
}

function knexTable(steps) {
  const step = steps.find(
    (each) =>
      each.args !== undefined &&
      firstString(each.args) !== undefined &&
      (KNEX_TABLE_STEPS.has(each.name) || isClientName(each.name)),
  );
  return step === undefined ? undefined : tableKey(firstString(step.args));
}

function knex({ steps }, kind) {
  const writes = steps.some((step) => step.args !== undefined && KNEX_WRITES.has(step.name));
  const table = knexTable(steps);
  const matches = kind === WRITE ? writes : !writes;
  return table !== undefined && matches ? { orm: 'knex', table } : undefined;
}

function builderOwnerTable(steps, index) {
  const owner = steps[index - 1]?.name ?? '';
  const repository = wordsOf(owner).some((word) => REPOSITORY_WORDS.has(word));
  return repository ? tableKey(owner) : undefined;
}

function queryBuilderTable(steps, index, names) {
  const named = steps.find((step) => names.has(step.name) && step.args?.length > 0);
  const [first] = steps[index].args ?? [];
  const entity = first?.type === 'Identifier' && /^[A-Z]/u.test(first.name) ? first : undefined;
  const table = named === undefined ? tableOfArgument(entity) : tableOfArgument(named.args[0]);
  return table ?? builderOwnerTable(steps, index);
}

function queryBuilder({ steps }, kind) {
  const index = steps.findIndex((step) => step.name === 'createQueryBuilder');
  const last = steps.at(-1)?.name;
  const write = steps.findIndex((step) => QUERY_BUILDER_WRITES.has(step.name) && step.args);
  if (index === -1) {
    return undefined;
  }
  if (kind === 'read') {
    const isRead = QUERY_BUILDER_READS.has(last) && write === -1;
    const table = isRead ? queryBuilderTable(steps, index, QUERY_BUILDER_FROM) : undefined;
    return table === undefined ? undefined : { orm: TYPEORM, table };
  }
  const executes = last === 'execute';
  return write > index && executes
    ? { orm: TYPEORM, table: queryBuilderTable(steps, index, QUERY_BUILDER_TABLES) }
    : undefined;
}

const BUILDERS = [
  [KYSELY, kysely],
  [DRIZZLE, drizzle],
  [DRIZZLE, drizzleFind],
  ['knex', knex],
  [TYPEORM, queryBuilder],
];

export function builderSite(chain, kind, orms) {
  for (const [orm, recognize] of BUILDERS) {
    const site = orms.includes(orm) ? recognize(chain, kind) : undefined;
    if (site !== undefined) {
      return site;
    }
  }
  return undefined;
}
