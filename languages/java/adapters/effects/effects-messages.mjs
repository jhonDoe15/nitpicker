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

export const EFFECTS_MESSAGES = {
  IoCallInLoop: loopIo,
  AccumulatorCopyInLoop: accumulatorCopy,
};

export const EFFECTS_RULES = Object.keys(EFFECTS_MESSAGES).map((rule) => `effects/${rule}`);
