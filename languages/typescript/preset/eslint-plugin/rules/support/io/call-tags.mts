import { LOOSE_STATEMENT as untypedLooseStatement } from '../../../../../../../shared/rules/security/sql-text.mjs';
import { wordsOf as untypedWordsOf } from '../../../../../../../shared/naming/secret-words.mjs';
import type { CallArgument, CallView } from './call-views.mts';
import { isCachePackage, type IoKind } from './packages.mts';

export type Effects = Map<string, string[]>;

const LOOSE_STATEMENT: RegExp = untypedLooseStatement;
const wordsOf: (name: string) => string[] = untypedWordsOf;

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
const BUILDERS = new Set(['createQueryBuilder', 'createQueryRunner']);
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
const DEDUPLICATION_KEYS = new Map<string, readonly [string, number]>([
  ['@aws-sdk/client-sqs', ['MessageDeduplicationId', 2]],
  ['@aws-sdk/client-sns', ['MessageDeduplicationId', 2]],
  ['bullmq', ['jobId', 2]],
  ['bull', ['jobId', 2]],
  ['nats', ['msgID', 2]],
  ['@azure/service-bus', ['messageId', 0]],
]);

function inSet(set: ReadonlySet<string>, value: string | undefined): boolean {
  return value !== undefined && set.has(value);
}

function isInputOutputMethod(name: string): boolean {
  const [first, second] = wordsOf(name);
  if (first === 'get') {
    return second === undefined || GETTER_LOOKUPS.has(second);
  }
  return METHOD_NAMES.has(name) || inSet(METHOD_PREFIXES, first);
}

function ownerKind(owner: string, method: string): IoKind | undefined {
  const words = wordsOf(owner);
  const last = words.at(-1);
  const pooled = last === 'pool' && POOL_METHODS.has(method);
  if (inSet(DATABASE_OWNERS, last) || inSet(MORE_DATABASE_OWNERS, last) || pooled) {
    return DATABASE;
  }
  if (last === 'client') {
    const stored = words.some(
      (word) => DATABASE_OWNERS.has(word) || MORE_DATABASE_OWNERS.has(word),
    );
    return stored || SQL_METHODS.has(method) ? DATABASE : REMOTE;
  }
  return inSet(REMOTE_OWNERS, last) ? REMOTE : undefined;
}

export function namedKind(view: CallView): IoKind | undefined {
  const { names, method } = view;
  if (method === undefined) {
    return undefined;
  }
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

function statementText(view: CallView): string | undefined {
  const [first] = view.args;
  const text = first !== undefined && 'text' in first ? first.text : undefined;
  const isStatement =
    text !== undefined && (LOOSE_STATEMENT.test(text) || UPSERT_STATEMENT.test(text));
  return isStatement ? text : undefined;
}

function isWriteName(name: string): boolean {
  const words = wordsOf(name);
  return (
    !BUILDERS.has(name) &&
    (inSet(WRITE_FIRST_WORDS, words[0]) ||
      words.some((word) => WRITE_WORDS.has(word)) ||
      STORE_WRITES.has(name) ||
      MORE_STORE_WRITES.has(name) ||
      RAW_WRITES.has(name))
  );
}

function isDatabaseWrite(view: CallView): boolean {
  const command = view.args[0]?.type === 'new' ? view.args[0].name : '';
  const text = statementText(view);
  if (text !== undefined) {
    return WRITE_STATEMENT.test(text);
  }
  return WRITE_COMMAND.test(command) || view.names.slice(1).some(isWriteName);
}

function argumentHasKey(argument: CallArgument | undefined, key: string): boolean {
  const input = argument?.type === 'new' ? argument.input : argument;
  if (input === undefined) {
    return false;
  }
  return input.type !== 'object' || input.keys.has(key) || input.keys.has('...');
}

function isDeduplicated(pkg: string | undefined, view: CallView): boolean {
  const contract = pkg === undefined ? undefined : DEDUPLICATION_KEYS.get(pkg);
  if (pkg === undefined || contract === undefined) {
    return false;
  }
  const [key, index] = contract;
  const position = pkg.startsWith('@aws-sdk/') || view.method === 'addBulk' ? 0 : index;
  return argumentHasKey(view.args[position], key);
}

function isUnkeyedPayment(pkg: string | undefined, view: CallView): boolean {
  return (
    pkg === 'stripe' && view.method === CREATE && !argumentHasKey(view.args[1], 'idempotencyKey')
  );
}

function isPlainInsert(view: CallView): boolean {
  const text = statementText(view);
  return text !== undefined && INSERT_STATEMENT.test(text) && !UPSERT_CLAUSE.test(text);
}

function isUnsafeWrite(kind: IoKind, pkg: string | undefined, view: CallView): boolean {
  if (kind === 'message') {
    return !isDeduplicated(pkg, view);
  }
  return isUnkeyedPayment(pkg, view) || (kind === DATABASE && isPlainInsert(view));
}

function isCache(pkg: string | undefined, view: CallView): boolean {
  if (pkg !== undefined) {
    return isCachePackage(pkg);
  }
  return view.names.slice(0, -1).some((name) => wordsOf(name).includes('redis'));
}

function directTags(kind: IoKind, pkg: string | undefined, view: CallView): string[] {
  const tags: string[] = [kind];
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

export function directEffects(
  kind: IoKind | undefined,
  pkg: string | undefined,
  view: CallView,
): Effects {
  return kind === undefined
    ? new Map<string, string[]>()
    : new Map(directTags(kind, pkg, view).map((tag) => [tag, [view.label]]));
}
