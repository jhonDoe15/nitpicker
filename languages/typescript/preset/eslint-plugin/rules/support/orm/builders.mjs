import { wordsOf } from '../../../../../../../shared/naming/secret-words.mjs';
import { firstString } from './chains.mjs';
import { tableKey } from './table-names.mjs';

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
  'kysely',
  'prisma',
  'drizzle',
]);
const KYSELY_WRITE_STARTS = new Set([
  'insertInto',
  'updateTable',
  'deleteFrom',
  'replaceInto',
  'mergeInto',
]);
const KNEX_WRITES = new Set([
  'insert',
  'update',
  'del',
  'delete',
  'upsert',
  'truncate',
  'increment',
  'decrement',
]);
const KNEX_TABLE_STEPS = new Set(['table', 'from', 'into']);
const DRIZZLE_WRITES = new Set(['insert', 'update', 'delete']);
const DRIZZLE_READS = new Set(['select', 'selectDistinct']);
const DRIZZLE_FIND = new Set(['findFirst', 'findMany']);
const QUERY_BUILDER_WRITES = new Set(['insert', 'update', 'delete', 'softDelete', 'restore']);
const QUERY_BUILDER_TABLES = new Set(['into', 'from', 'update']);
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
  const step = kind === 'write' ? write : start;
  return step === undefined
    ? undefined
    : { orm: 'kysely', table: tableKey(firstString(step.args)) };
}

function drizzle({ root, steps }, kind) {
  const names = kind === 'write' ? DRIZZLE_WRITES : DRIZZLE_READS;
  const index = steps.findIndex((step) => names.has(step.name) && step.args !== undefined);
  const owner = index <= 0 ? root : steps[index - 1].name;
  if (index === -1 || !isClientName(owner) || (index > 0 && steps[index - 1].args !== undefined)) {
    return undefined;
  }
  if (kind === 'write') {
    const [table] = steps[index].args;
    return isTableArgument(table) ? { orm: 'drizzle', table: tableOfArgument(table) } : undefined;
  }
  const from = steps.slice(index).find((step) => step.name === 'from' && step.args?.length > 0);
  return from === undefined ? undefined : { orm: 'drizzle', table: tableOfArgument(from.args[0]) };
}

function drizzleFind({ steps }) {
  const index = steps.findIndex((step) => step.name === 'query' && step.args === undefined);
  const method = steps[index + 2];
  const isFind = index !== -1 && DRIZZLE_FIND.has(method?.name) && method.args !== undefined;
  return isFind ? { orm: 'drizzle', table: tableKey(steps[index + 1].name) } : undefined;
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
  const matches = kind === 'write' ? writes : !writes;
  return table !== undefined && matches ? { orm: 'knex', table } : undefined;
}

function queryBuilder({ steps }, kind) {
  const index = steps.findIndex((step) => step.name === 'createQueryBuilder');
  const write = steps.findIndex((step) => QUERY_BUILDER_WRITES.has(step.name) && step.args);
  const executes = steps.at(-1)?.name === 'execute';
  if (index === -1 || kind !== 'write' || write < index || !executes) {
    return undefined;
  }
  const named = steps.find((step) => QUERY_BUILDER_TABLES.has(step.name) && step.args?.length > 0);
  const owner = steps[index - 1]?.name ?? '';
  const repository = wordsOf(owner).some((word) => REPOSITORY_WORDS.has(word));
  const table = named === undefined ? undefined : tableOfArgument(named.args[0]);
  return { orm: 'typeorm', table: table ?? (repository ? tableKey(owner) : undefined) };
}

const BUILDERS = [
  ['kysely', kysely],
  ['drizzle', drizzle],
  ['drizzle', drizzleFind],
  ['knex', knex],
  ['typeorm', queryBuilder],
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
