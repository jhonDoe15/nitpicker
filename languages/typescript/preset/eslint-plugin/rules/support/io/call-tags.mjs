import { LOOSE_STATEMENT } from '../../../../../../../shared/rules/security/sql-text.mjs';
import { wordsOf } from '../identifier-words.mjs';
import { isCachePackage } from './packages.mjs';

const DATABASE = 'database';
const REMOTE = 'remote';
const QUERY = 'query';
const EXECUTE = 'execute';
const DATABASE_OWNERS = new Set(['repo', 'repository', 'dao', 'db', DATABASE, 'prisma']);
const POOL_METHODS = new Set([QUERY, 'connect', EXECUTE]);
const CALLBACK_SEARCHES = new Set(['find', 'filter', 'some', 'every', 'map']);
const MORE_DATABASE_OWNERS = new Set(['connection', 'knex', 'redis', 'sql', 'pg', 'mongo']);
const REMOTE_OWNERS = new Set(['http', 'axios', 'api', 'gateway']);
const WRITE_WORDS = new Set(['update', 'delete', 'remove', 'replace', 'upsert']);
const CREATE = 'create';
const INSERT = 'insert';
const METHOD_PREFIXES = new Set([
  ...WRITE_WORDS,
  'find',
  'fetch',
  'load',
  'read',
  QUERY,
  'select',
  INSERT,
  'save',
  CREATE,
  'count',
  EXECUTE,
  'write',
  'list',
]);
const GETTER_LOOKUPS = new Set(['by', 'all', 'many', 'one', 'page']);
const METHOD_NAMES = new Set(['exists', 'exec', 'send', 'post', 'put', 'patch', 'request', 'raw']);
const SQL_METHODS = new Set([QUERY, EXECUTE, 'exec', 'raw', 'run', 'select', INSERT]);
const WRITE_FIRST_WORDS = new Set([
  ...WRITE_WORDS,
  'save',
  INSERT,
  'del',
  'destroy',
  CREATE,
  'persist',
  'put',
  'increment',
  'decrement',
  'bulk',
  'restore',
  'soft',
  'truncate',
]);
const STORE_WRITES = new Set(['set', 'hset', 'hmset', 'hdel', 'mset', 'setex', 'incr', 'incrby']);
const MORE_STORE_WRITES = new Set([
  'decr',
  'lpush',
  'rpush',
  'sadd',
  'srem',
  'zadd',
  'zrem',
  'expire',
]);
const RAW_WRITES = new Set(['$executeRaw', '$executeRawUnsafe']);
const WRITE_COMMAND = /^(?:Put|Update|Delete|BatchWrite|TransactWrite)(?:Item|Items)?Command$/u;
const WRITE_STATEMENT =
  /^\s*(?:WITH\b[\s\S]*?\)\s*)?(?:INSERT|UPDATE|DELETE|MERGE|REPLACE|UPSERT)\b/iu;
const UPSERT_STATEMENT = /^\s*UPSERT\s+INTO\b/iu;
const INSERT_STATEMENT = /^\s*(?:WITH\b[\s\S]*?\)\s*)?INSERT\b/iu;
const UPSERT_CLAUSE =
  /\bON\s+CONFLICT\b|\bON\s+DUPLICATE\s+KEY\b|\bINSERT\s+IGNORE\b|\bINSERT\s+OR\s+(?:IGNORE|REPLACE)\b/iu;
const DEDUPLICATION_KEYS = new Map([
  ['@aws-sdk/client-sqs', ['MessageDeduplicationId', 2]],
  ['@aws-sdk/client-sns', ['MessageDeduplicationId', 2]],
  ['bullmq', ['jobId', 2]],
  ['bull', ['jobId', 2]],
  ['nats', ['msgID', 2]],
  ['@azure/service-bus', ['messageId', 0]],
]);

function isInputOutputMethod(name) {
  const [first, second] = wordsOf(name);
  if (first === 'get') {
    return second === undefined || GETTER_LOOKUPS.has(second);
  }
  return METHOD_NAMES.has(name) || METHOD_PREFIXES.has(first);
}

function ownerKind(owner, method) {
  const words = wordsOf(owner);
  const last = words.at(-1);
  const pooled = last === 'pool' && POOL_METHODS.has(method);
  if (DATABASE_OWNERS.has(last) || MORE_DATABASE_OWNERS.has(last) || pooled) {
    return DATABASE;
  }
  if (last === 'client') {
    const stored = words.some(
      (word) => DATABASE_OWNERS.has(word) || MORE_DATABASE_OWNERS.has(word),
    );
    return stored || SQL_METHODS.has(method) ? DATABASE : REMOTE;
  }
  return REMOTE_OWNERS.has(last) ? REMOTE : undefined;
}

export function namedKind(view) {
  const { names, method } = view;
  if (names.length === 1 && method === 'fetch') {
    return REMOTE;
  }
  const searches =
    CALLBACK_SEARCHES.has(method) && view.args.some((arg) => arg.type === 'function');
  if (names.length < 2 || searches || !isInputOutputMethod(method)) {
    return undefined;
  }
  const kinds = names.slice(0, -1).map((owner) => ownerKind(owner, method));
  return kinds.find((kind) => kind === DATABASE) ?? kinds.find((kind) => kind !== undefined);
}

function statementText(view) {
  const [first] = view.args;
  const isStatement =
    first?.type === 'text' &&
    (LOOSE_STATEMENT.test(first.text) || UPSERT_STATEMENT.test(first.text));
  return isStatement ? first.text : undefined;
}

function isWriteName(name) {
  const words = wordsOf(name);
  return (
    WRITE_FIRST_WORDS.has(words[0]) ||
    words.some((word) => WRITE_WORDS.has(word)) ||
    STORE_WRITES.has(name) ||
    MORE_STORE_WRITES.has(name) ||
    RAW_WRITES.has(name)
  );
}

function isDatabaseWrite(view) {
  const command = view.args[0]?.type === 'new' ? view.args[0].name : '';
  const text = statementText(view);
  if (text !== undefined) {
    return WRITE_STATEMENT.test(text);
  }
  return WRITE_COMMAND.test(command) || view.names.slice(1).some(isWriteName);
}

function argumentHasKey(argument, key) {
  const input = argument?.type === 'new' ? argument.input : argument;
  if (input === undefined) {
    return false;
  }
  return input.type !== 'object' || input.keys.has(key) || input.keys.has('...');
}

function isDeduplicated(pkg, view) {
  const contract = DEDUPLICATION_KEYS.get(pkg);
  if (contract === undefined) {
    return false;
  }
  const [key, index] = contract;
  const position = pkg.startsWith('@aws-sdk/') || view.method === 'addBulk' ? 0 : index;
  return argumentHasKey(view.args[position], key);
}

function isUnkeyedPayment(pkg, view) {
  return (
    pkg === 'stripe' && view.method === CREATE && !argumentHasKey(view.args[1], 'idempotencyKey')
  );
}

function isPlainInsert(view) {
  const text = statementText(view);
  return text !== undefined && INSERT_STATEMENT.test(text) && !UPSERT_CLAUSE.test(text);
}

function isUnsafeWrite(kind, pkg, view) {
  if (kind === 'message') {
    return !isDeduplicated(pkg, view);
  }
  return isUnkeyedPayment(pkg, view) || (kind === DATABASE && isPlainInsert(view));
}

function isCache(pkg, view) {
  if (pkg !== undefined) {
    return isCachePackage(pkg);
  }
  return view.names.slice(0, -1).some((name) => wordsOf(name).includes('redis'));
}

function directTags(kind, pkg, view) {
  const tags = [kind];
  if (kind === DATABASE && isCache(pkg, view)) {
    tags.push('cache');
  }
  if (kind === DATABASE && isDatabaseWrite(view)) {
    tags.push('write');
  }
  if (isUnsafeWrite(kind, pkg, view)) {
    tags.push('unsafe');
  }
  return tags;
}

export function directEffects(kind, pkg, view) {
  return kind === undefined
    ? new Map()
    : new Map(directTags(kind, pkg, view).map((tag) => [tag, [view.label]]));
}
