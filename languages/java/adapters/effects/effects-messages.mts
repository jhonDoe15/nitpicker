import { DELETED_MESSAGES } from './messages/deleted.mts';
import { JOB_MESSAGES } from './messages/jobs.mts';
import { RACE_MESSAGES } from './messages/races.mts';
import { callPath, code } from './messages/text.mts';
import type { Language } from '../reuse/source/jvm-source-types.mts';
import type {
  AccumulatorFact,
  AsyncBlockingFact,
  AsyncTwinFact,
  DualWriteFact,
  ExistenceFact,
  GraphqlFact,
  HeldCallFact,
  LazyRelationFact,
  LoopIoFact,
  OneColumnFact,
  ReactiveFact,
  RetryWriteFact,
  RowsChangedFact,
  StaleRetryFact,
} from './messages/message-facts.mts';

export { callPath };

const REMOTE = 'remote';
const BOUNDED: Readonly<Record<Language, string>> = {
  java: [
    'a bounded executor (`Executors.newFixedThreadPool(n)`, a bounded `ThreadPoolExecutor`)',
    'or a `Semaphore`',
  ].join(' '),
  kotlin:
    '`Semaphore.withPermit`, `flatMapMerge(concurrency = n)`, `limitedParallelism(n)` or `chunked(n)`',
};
const COLLECTING: Readonly<Record<Language, string>> = {
  java: [
    '`collect(Collectors.toList())`, `toMap`, `groupingBy`, `flatMap`,',
    'or one mutable collection filled in the loop',
  ].join(' '),
  kotlin:
    '`map`, `flatMap`, `associate`, `groupBy`, `buildList`, or one mutable collection filled in the loop',
};

const ONE_QUERY = '`findAllById`, `saveAll`, `WHERE id IN (...)`';
const LOOPS_FINE =
  'Paging, polling and retry loops are fine; a loop the rule misjudges (a cursor kept in an object or array, a page count read first) goes in `exceptions`.';

const REDIS_BATCH = '`MGET` (`opsForValue().multiGet(keys)`) or a pipeline (`executePipelined`)';

function loopIo({ method, kind, form, path, store }: LoopIoFact, language: Language): string {
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
  if (kind === REMOTE) {
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

function accumulatorCopy({ method, variable, form }: AccumulatorFact, language: Language): string {
  const step = form === 'reduce' ? 'each `reduce` step' : 'each loop step';
  return [
    `Build the result once with ${COLLECTING[language]}: in ${code(`${method}()`)} ${step}`,
    `copies ${code(variable)} into a new collection, so the work grows with the square of the list.`,
  ].join(' ');
}

function graphPaths(relation: string, language: Language): string {
  return language === 'kotlin' ? `["${relation}"]` : `"${relation}"`;
}

function lazyRelation(
  { method, entity, relation, origin }: LazyRelationFact,
  language: Language,
): string {
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

function heldScope(scope: string, holder: string): string {
  if (scope === 'retry loop') {
    return `a retry loop in ${code(`${holder}()`)}`;
  }
  return scope.startsWith('@') || scope === 'synchronized'
    ? `the ${code(scope)} method ${code(`${holder}()`)}`
    : `${code(scope)} in ${code(`${holder}()`)}`;
}

function remoteInTransaction({ method, scope, holder, path }: HeldCallFact): string {
  return [
    'Make the remote call before the transaction starts or after it commits; when its side effect must',
    'match the transaction, write an outbox row in the transaction and send it from a worker:',
    `${code(`${method}()`)} ${callPath(path)} inside ${heldScope(scope, holder)}, which also uses the`,
    "database, so a pooled connection stays held for the remote call's latency and the pool runs dry under load.",
  ].join(' ');
}

function remoteUnderLock({ method, scope, holder, path }: HeldCallFact): string {
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

const IDEMPOTENT_FORMS: Readonly<Record<string, string>> = {
  payment:
    'Pass a stable idempotency key derived from the request (`RequestOptions.builder().setIdempotencyKey(...)`)',
  insert:
    'Make the insert an upsert keyed on a stable id (`ON CONFLICT`, `ON DUPLICATE KEY UPDATE`, `MERGE`)',
  message:
    'Give the message a deduplication id the broker honours (SQS or SNS FIFO `messageDeduplicationId`)',
};

function retryWrite({ method, scope, holder, write, path }: RetryWriteFact): string {
  return [
    `${IDEMPOTENT_FORMS[write] ?? ''}, or retry only the read:`,
    `${code(`${method}()`)} ${callPath(path)} inside ${heldScope(scope, holder)},`,
    'and when a call times out after the other side accepted the write, the retry makes it again.',
  ].join(' ');
}

function dualWrite({ method, form, write, path }: DualWriteFact): string {
  const where = `${code(`${method}()`)} writes with ${code(write.at(-1) ?? '')} and publishes`;
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

const BATCH_FIELDS: Readonly<Record<string, string>> = {
  spring: '`@BatchMapping` (one call for all parents) or a registered `DataLoader`',
  dgs: 'a `@DgsDataLoader` (one call for all parents) read through `DataLoader.load`',
};

function graphqlField({ method, framework, kind, path }: GraphqlFact): string {
  const target = kind === REMOTE ? 'requests' : 'queries';
  return [
    `Batch this field with ${BATCH_FIELDS[framework] ?? ''}, or read the value from the parent object:`,
    `${code(`${method}()`)} ${callPath(path)} once per parent object, so a list of N parents`,
    `sends N ${target}, and nothing in the code looks like a loop.`,
  ].join(' ');
}

function reactiveLookup({ method, kind, path, limited }: ReactiveFact): string {
  const target = kind === REMOTE ? 'requests' : 'queries';
  const bound = limited
    ? 'The concurrency argument bounds how many run at once, but each element still sends its own query.'
    : '';
  return [
    'Fetch all the elements with one call (`findAllById`, `where id in (:ids)`, a batch endpoint), then join the',
    `results in memory: ${code(`${method}()`)} ${callPath(path)} once per element of an in-memory collection`,
    `inside a reactive pipeline, so N elements send N ${target}.`,
    bound,
  ]
    .filter(Boolean)
    .join(' ');
}

const LIFECYCLE = [
  'An entity with `@Version`, `@PreUpdate`/`@PreRemove`, `@EntityListeners`, auditing, domain events or cascades',
  'is not reported, because a bulk statement skips what these run.',
].join(' ');

function rowsChanged({ method, form, origin, entity }: RowsChangedFact): string {
  if (form === 'delete') {
    return [
      'Delete the rows with one statement (`deleteAllInBatch`, or a `@Modifying` delete query with the same',
      'where clause)',
      `instead of loading them first: ${code(`${method}()`)} loads ${code(entity)} rows with ${code(origin)} only to`,
      `delete them. ${LIFECYCLE}`,
    ].join(' ');
  }
  return [
    'Change the rows with one statement (`@Modifying @Query("update ' +
      entity +
      ' e set e.status = :to where ...")`)',
    `instead of loading them: ${code(`${method}()`)} loads ${code(entity)} rows with ${code(origin)} only to set the`,
    `same value on each and write them back. ${LIFECYCLE}`,
  ].join(' ');
}

function oneColumn({ method, entity, property, origin }: OneColumnFact): string {
  const column = property.replace(/^(get|is)/u, '');
  const name = column.charAt(0).toLowerCase() + column.slice(1);
  return [
    `Select only the column with a projection (\`@Query("select e.${name} from ${entity} e where ...")\`,`,
    `an interface or record projection): ${code(`${method}()`)} loads whole ${code(entity)} entities with`,
    code(origin),
    `only to read ${code(`${property}()`)} from each, with their eager relations.`,
  ].join(' ');
}

function existence({ method, form, origin }: ExistenceFact): string {
  const how =
    form === 'count'
      ? `counts the matching rows with ${code(origin)} only to compare the count with zero`
      : `loads the whole row with ${code(origin)} only to test whether it is there`;
  return [
    'Ask the database with `existsBy...` (or an `exists` query) instead, which stops at the first row:',
    `${code(`${method}()`)} ${how}.`,
  ].join(' ');
}

function staleRetry({ method, scope, object, write }: StaleRetryFact): string {
  const where =
    scope === '@Retryable'
      ? 'is retried by `@Retryable` after an optimistic-lock conflict but takes the object to save as a parameter'
      : `retries after an optimistic-lock conflict (${scope}) but sends an object that was read or built outside` +
        ' the retry';
  return [
    'Re-read the row by id and re-apply the change inside the retried scope',
    '(`Mono.defer { findById(id).map(change).flatMap(save) }`, a loop that loads the row on each attempt,',
    `or a \`@Retryable\` method that takes the id): ${code(`${method}()`)} ${where},`,
    `then calls ${code(write)} with ${code(object)}, which keeps the old version,`,
    'so every attempt fails the same way.',
  ].join(' ');
}

function asyncBlocking({ method, wrapper, path }: AsyncBlockingFact): string {
  return [
    'Submit the work to an executor (`executor.submit`, `supplyAsync(..., executor)`),',
    "use the client's real async API, or make the method synchronous:",
    `${code(`${method}()`)} ${callPath(path)} on the calling thread and only wraps the`,
    `result with ${code(wrapper)}, so a caller on an event-loop or single-thread executor waits on it.`,
  ].join(' ');
}

function asyncTwin({ method, async, sync }: AsyncTwinFact): string {
  return [
    `Call the synchronous ${code(sync)} instead: ${code(`${method}()`)} waits on ${code(async)}, which takes an`,
    'executor thread, blocks the caller anyway and turns every failure into an `ExecutionException`.',
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
  GraphqlFieldPerParent: graphqlField,
  ReactiveLookupPerElement: reactiveLookup,
  RowsChangedInMemory: rowsChanged,
  EntityLoadedForOneColumn: oneColumn,
  EntityLoadedForExistence: existence,
  RetryWithStaleObject: staleRetry,
  ...RACE_MESSAGES,
  AsyncMethodDoesBlockingWork: asyncBlocking,
  WaitOnAsyncTwin: asyncTwin,
  ...JOB_MESSAGES,
  ...DELETED_MESSAGES,
};

export const EFFECTS_RULES = Object.keys(EFFECTS_MESSAGES).map((rule) => `effects/${rule}`);
