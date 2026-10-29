const BOUNDED = {
  java: [
    'a bounded executor (`Executors.newFixedThreadPool(n)`, a bounded `ThreadPoolExecutor`)',
    'or a `Semaphore`',
  ].join(' '),
  kotlin:
    '`Semaphore.withPermit`, `flatMapMerge(concurrency = n)`, `limitedParallelism(n)` or `chunked(n)`',
};
const COLLECTING = {
  java: [
    '`collect(Collectors.toList())`, `toMap`, `groupingBy`, `flatMap`,',
    'or one mutable collection filled in the loop',
  ].join(' '),
  kotlin:
    '`map`, `flatMap`, `associate`, `groupBy`, `buildList`, or one mutable collection filled in the loop',
};

const ONE_QUERY = '`findAllById`, `saveAll`, `WHERE id IN (...)`';
const LOOPS_FINE = 'Paging, polling and retry loops are fine.';

function code(text) {
  return `\`${text}\``;
}

export function callPath(path) {
  const [first, ...rest] = path.map(code);
  return rest.length === 0 ? `calls ${first}` : `calls ${[first, ...rest].join(', which calls ')}`;
}

const REDIS_BATCH = '`MGET` (`opsForValue().multiGet(keys)`) or a pipeline (`executePipelined`)';

function loopIo({ method, kind, form, path, store }, language) {
  const where = `${code(`${method}()`)} ${callPath(path)}`;
  if (store === 'redis') {
    return [
      `Read or write all keys in one round trip with ${REDIS_BATCH}:`,
      `${where} once per loop item, one round trip each. ${LOOPS_FINE}`,
    ].join(' ');
  }
  if (form === 'concurrent') {
    return [
      `Fetch or write the items in one query (${ONE_QUERY}): ${where} for each item,`,
      'and running them concurrently still sends one query per item.',
    ].join(' ');
  }
  if (kind === 'remote') {
    return [
      "Use the service's batch endpoint for all items, or, when it has none, bound the concurrency with",
      `${BOUNDED[language]}: ${where} once per loop item, one request each. ${LOOPS_FINE}`,
    ].join(' ');
  }
  return [
    'Fetch or write all items at once (`findAllById`, `saveAll`, `deleteAllById`, `WHERE id IN (...)`,',
    `or a helper that takes the whole list): ${where} once per loop item, one query each. ${LOOPS_FINE}`,
  ].join(' ');
}

function accumulatorCopy({ method, variable, form }, language) {
  const step = form === 'reduce' ? 'each `reduce` step' : 'each loop step';
  return [
    `Build the result once with ${COLLECTING[language]}: in ${code(`${method}()`)} ${step}`,
    `copies ${code(variable)} into a new collection, so the work grows with the square of the list.`,
  ].join(' ');
}

function graphPaths(relation, language) {
  return language === 'kotlin' ? `["${relation}"]` : `"${relation}"`;
}

function lazyRelation({ method, entity, relation, origin }, language) {
  const loaded = code(`${entity}.${relation}`);
  return [
    `Fetch ${loaded} with the query that loads the list:`,
    `add \`@EntityGraph(attributePaths = ${graphPaths(relation, language)})\` to ${code(origin)}`,
    `or a \`JOIN FETCH\` of ${code(relation)} to its query, batch the loads with \`@BatchSize\` on the`,
    'relationship or `hibernate.default_batch_fetch_size`, or select a projection that holds the values:',
    `${code(`${method}()`)} reads the lazy ${code(relation)} of each ${code(entity)} that ${code(origin)}`,
    'returns, one more query per item.',
  ].join(' ');
}

function heldScope(scope, holder) {
  if (scope === 'retry loop') {
    return `a retry loop in ${code(`${holder}()`)}`;
  }
  return scope.startsWith('@') || scope === 'synchronized'
    ? `the ${code(scope)} method ${code(`${holder}()`)}`
    : `${code(scope)} in ${code(`${holder}()`)}`;
}

function remoteInTransaction({ method, scope, holder, path }) {
  return [
    'Make the remote call before the transaction starts or after it commits; when its side effect must',
    'match the transaction, write an outbox row in the transaction and send it from a worker:',
    `${code(`${method}()`)} ${callPath(path)} inside ${heldScope(scope, holder)}, which also uses the`,
    "database, so a pooled connection stays held for the remote call's latency and the pool runs dry under load.",
  ].join(' ');
}

function remoteUnderLock({ method, scope, holder, path }) {
  return [
    'Make the remote call before taking the lock or after releasing it, and keep only the change of the',
    'shared state inside; copy the value you need out of the lock first:',
    `${code(`${method}()`)} ${callPath(path)} while holding ${heldScope(scope, holder)},`,
    "so every thread waiting for the lock also waits for the remote call's latency.",
    'A fill-once block stays allowed: the call under an `if` that tests the state the block then sets',
    '(a token refresh, a cached download), so callers wait for one request instead of each sending their',
    'own. When the remote effect must happen exactly once per state change, record it in an outbox row and',
    'send it from a worker.',
  ].join(' ');
}

const IDEMPOTENT_FORMS = {
  payment:
    'Pass a stable idempotency key derived from the request (`RequestOptions.builder().setIdempotencyKey(...)`)',
  insert:
    'Make the insert an upsert keyed on a stable id (`ON CONFLICT`, `ON DUPLICATE KEY UPDATE`, `MERGE`)',
  message:
    'Give the message a deduplication id the broker honours (SQS or SNS FIFO `messageDeduplicationId`)',
};

function retryWrite({ method, scope, holder, write, path }) {
  return [
    `${IDEMPOTENT_FORMS[write]}, or retry only the read:`,
    `${code(`${method}()`)} ${callPath(path)} inside ${heldScope(scope, holder)},`,
    'and when a call times out after the other side accepted the write, the retry makes it again.',
  ].join(' ');
}

function dualWrite({ method, form, write, path }) {
  const where = `${code(`${method}()`)} writes with ${code(write.at(-1))} and publishes`;
  const outbox = [
    'Write the message to an outbox table in the same transaction and let a relay publish it',
    '(or use change data capture or a database-backed queue):',
  ].join(' ');
  if (form === 'afterCommit') {
    return [
      `${outbox} ${where} after the commit through ${callPath(path).replace(/^calls /u, '')},`,
      'which never announces a rolled-back change, but a crash between the commit and the publish loses',
      'the message.',
    ].join(' ');
  }
  return [
    `${outbox} ${where} through ${callPath(path).replace(/^calls /u, '')}, so a rollback after the`,
    'publish announces a change that never happened, and a crash after the commit loses the message.',
  ].join(' ');
}

export const EFFECTS_MESSAGES = {
  IoCallInLoop: loopIo,
  AccumulatorCopyInLoop: accumulatorCopy,
  LazyRelationInLoop: lazyRelation,
  RemoteCallInTransaction: remoteInTransaction,
  RemoteCallUnderLock: remoteUnderLock,
  RetryWithoutIdempotency: retryWrite,
  DualWriteWithoutOutbox: dualWrite,
};

export const EFFECTS_RULES = Object.keys(EFFECTS_MESSAGES).map((rule) => `effects/${rule}`);
