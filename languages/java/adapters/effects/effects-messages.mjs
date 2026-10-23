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

function loopIo({ method, kind, form, path }, language) {
  const where = `${code(`${method}()`)} ${callPath(path)}`;
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
  return scope === '@Transactional' || scope === 'synchronized'
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
    'Move the remote call out of the lock: read what it needs under the lock, release it, make the call,',
    'and take the lock again to apply the result:',
    `${code(`${method}()`)} ${callPath(path)} while holding ${heldScope(scope, holder)},`,
    "so every thread waiting for the lock also waits for the remote call's latency.",
  ].join(' ');
}

export const EFFECTS_MESSAGES = {
  IoCallInLoop: loopIo,
  AccumulatorCopyInLoop: accumulatorCopy,
  LazyRelationInLoop: lazyRelation,
  RemoteCallInTransaction: remoteInTransaction,
  RemoteCallUnderLock: remoteUnderLock,
};

export const EFFECTS_RULES = Object.keys(EFFECTS_MESSAGES).map((rule) => `effects/${rule}`);
