import { QUERY_TYPES } from '../data/data-types.mts';
import { entriesOf } from '../spring-scopes.mts';
import { ENTITY_MANAGER, JDBC, JOOQ_CONTEXT, JOOQ_RECORDS } from '../spring-types.mts';
import type { Fqns, InvocationFact, SpringView } from '../typed/spring-shapes.mts';

export const REPOSITORY_WRITES = [
  'save',
  'saveAll',
  'saveAndFlush',
  'saveAllAndFlush',
  'delete',
  'deleteAll',
  'deleteById',
  'deleteAllById',
  'deleteAllInBatch',
  'persist',
  'merge',
  'remove',
];
const VERBS = [
  'update',
  'delete',
  'remove',
  'mark',
  'set',
  'rename',
  'insert',
  'upsert',
  'increment',
  'decrement',
  'reset',
  'clear',
  'purge',
  'archive',
  'touch',
];
export const WRITE_VERB = new RegExp(String.raw`^(?:${VERBS.join('|')})(?:[A-Z\d_]|$)`, 'u');
const WRITES = new Set(REPOSITORY_WRITES);
const JDBC_WRITES = new Set(['update', 'batchUpdate']);
const QUERY_FACTORY = /^\w+\.create(?:Native|Named)?Query\(/u;
const JDBC_CLIENT_CHAIN = /^\w+\.sql\(/u;
const ROOT = /^\w+/u;
const DML = /^"{1,3}\s*(?:insert|update|delete|merge|upsert|replace|truncate)\s/iu;
const JOOQ_CHAIN = /^\w+\s*\.\s*(?:insertInto|update|deleteFrom|delete|mergeInto|truncate)\s*\(/u;
const JOOQ_RUNS = new Set([
  'execute',
  'executeAsync',
  'fetch',
  'fetchOne',
  'fetchSingle',
  'fetchOptional',
  'fetchInto',
]);
const JOOQ_CONTEXT_WRITES = new Set(['executeInsert', 'executeUpdate', 'executeDelete']);
const JOOQ_RECORD_WRITES = new Set(['store', 'insert', 'update', 'delete', 'merge']);
const WRITING_QUERIES = new Set(['Modifying', 'Procedure']);

function receiverType(view: SpringView, invocation: InvocationFact): string | undefined {
  return invocation.receiver === undefined
    ? undefined
    : view.typeOf(invocation.scope, invocation.receiver);
}

function typed(view: SpringView, type: string | undefined, fqns: Fqns): boolean {
  return type !== undefined && view.is(type, fqns);
}

function modifying(view: SpringView, type: string, name: string): boolean {
  return view
    .projectFunctions(type, name)
    .some((fn) =>
      entriesOf(fn).some((entry) =>
        WRITING_QUERIES.has((entry.type ?? entry.name).split('.').at(-1) ?? ''),
      ),
    );
}

function repositoryWrite(view: SpringView, invocation: InvocationFact): boolean {
  const type = receiverType(view, invocation);
  const repository = type !== undefined && view.isRepository(type);
  return (
    (WRITES.has(invocation.name) && (repository || typed(view, type, ENTITY_MANAGER))) ||
    (WRITE_VERB.test(invocation.name) && repository) ||
    (type !== undefined && repository && modifying(view, type, invocation.name))
  );
}

function rootType(view: SpringView, invocation: InvocationFact): string | undefined {
  const root = ROOT.exec(invocation.receiver ?? '')?.[0];
  return root === undefined ? undefined : view.typeOf(invocation.scope, root);
}

function sqlText(view: SpringView, text = ''): string {
  const constant = [...view.file.properties, ...(view.file.globals ?? [])].find(
    (entry) => entry.name === text && entry.literalText !== undefined,
  );
  return constant?.literalText ?? text;
}

function jdbcWrite(
  view: SpringView,
  invocation: InvocationFact,
  type: string | undefined,
): boolean {
  return (
    (JDBC_WRITES.has(invocation.name) && typed(view, type, JDBC)) ||
    (invocation.name === 'execute' &&
      typed(view, type, JDBC) &&
      DML.test(sqlText(view, invocation.arguments[0]?.text)))
  );
}

function jooqWrite(
  view: SpringView,
  invocation: InvocationFact,
  type: string | undefined,
): boolean {
  return (
    (JOOQ_RUNS.has(invocation.name) &&
      JOOQ_CHAIN.test(invocation.receiver ?? '') &&
      typed(view, rootType(view, invocation), JOOQ_CONTEXT)) ||
    (JOOQ_CONTEXT_WRITES.has(invocation.name) && typed(view, type, JOOQ_CONTEXT)) ||
    (JOOQ_RECORD_WRITES.has(invocation.name) &&
      type !== undefined &&
      (view.is(type, JOOQ_RECORDS) || view.extendsType(type, JOOQ_RECORDS)))
  );
}

export function databaseWrite(view: SpringView, invocation: InvocationFact): boolean {
  if (invocation.assign === true) {
    return false;
  }
  if (repositoryWrite(view, invocation)) {
    return true;
  }
  const type = receiverType(view, invocation);
  if (jdbcWrite(view, invocation, type) || jooqWrite(view, invocation, type)) {
    return true;
  }
  if (invocation.name === 'update' && JDBC_CLIENT_CHAIN.test(invocation.receiver ?? '')) {
    return typed(view, rootType(view, invocation), JDBC);
  }
  return (
    invocation.name === 'executeUpdate' &&
    (typed(view, type, QUERY_TYPES) ||
      (QUERY_FACTORY.test(invocation.receiver ?? '') &&
        typed(view, rootType(view, invocation), ENTITY_MANAGER)))
  );
}
