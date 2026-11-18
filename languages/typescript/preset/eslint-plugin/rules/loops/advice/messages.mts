const EXCEPTION = 'An exception fits only when a call per item is intended';
const PAGING =
  'Paging, cursor and retry loops are fine, and so is a call that takes a whole chunk of the items.';
const BATCH_QUERY = [
  'Fetch or write them in one query: a batch method (`findByIds`, `findAllById`, `createMany`,',
  '`insertMany`) or `WHERE id IN (...)`, run before the loop.',
].join(' ');

export const IO_IN_LOOP_MESSAGES = {
  query: [
    'This runs {{callee}} once per item of a loop, one query per item.',
    BATCH_QUERY,
    PAGING,
    `${EXCEPTION} (a store with no batch form).`,
  ].join(' '),
  setQuery: [
    'This runs {{callee}} once per item of a loop, and the call already takes a set of keys,',
    'so the cost is the number of iterations of the outer loop.',
    'Keep that loop small and bounded (a few workspaces or pages), or collect the keys of all its',
    'items and run one such call after it.',
    PAGING,
  ].join(' '),
  cacheQuery: [
    'This runs {{callee}} once per item of a loop, one round trip per item.',
    'Fetch or write them in one round trip: `mget`/`mset`/`hmget`, or queue the commands on',
    '`pipeline()` (or `multi()`) and `exec()` it once after the loop.',
    PAGING,
    `${EXCEPTION} (a command with no multi-key form).`,
  ].join(' '),
  concurrentQuery: [
    'This runs {{callee}} once per item inside a concurrent `Promise.all`:',
    'running them concurrently still sends one query per item.',
    BATCH_QUERY,
    `${EXCEPTION} (a store with no batch form).`,
  ].join(' '),
  request: [
    'This calls {{callee}} once per item of a loop, one request after another.',
    "Use the API's batch endpoint when it has one; otherwise run the requests with bounded concurrency:",
    '`p-limit`, `p-map` with `{ concurrency }`, or `Promise.all` over fixed-size chunks.',
    PAGING,
    `${EXCEPTION} (an API with no batch form and a rate limit).`,
  ].join(' '),
};
