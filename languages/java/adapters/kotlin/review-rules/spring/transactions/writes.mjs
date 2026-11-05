import { QUERY_TYPES } from '../data/data-types.mjs';
import { ENTITY_MANAGER, JDBC } from '../spring-types.mjs';

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

function receiverType(view, invocation) {
  return invocation.receiver === undefined
    ? undefined
    : view.typeOf(invocation.scope, invocation.receiver);
}

function typed(view, type, fqns) {
  return type !== undefined && view.is(type, fqns);
}

export function repositoryWrite(view, invocation) {
  const type = receiverType(view, invocation);
  const repository = type !== undefined && view.isRepository(type);
  return (
    (WRITES.has(invocation.name) && (repository || typed(view, type, ENTITY_MANAGER))) ||
    (WRITE_VERB.test(invocation.name) && repository)
  );
}

function rootType(view, invocation) {
  const root = ROOT.exec(invocation.receiver ?? '')?.[0];
  return root === undefined ? undefined : view.typeOf(invocation.scope, root);
}

export function databaseWrite(view, invocation) {
  if (invocation.assign === true) {
    return false;
  }
  if (repositoryWrite(view, invocation)) {
    return true;
  }
  const type = receiverType(view, invocation);
  if (JDBC_WRITES.has(invocation.name) && typed(view, type, JDBC)) {
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
