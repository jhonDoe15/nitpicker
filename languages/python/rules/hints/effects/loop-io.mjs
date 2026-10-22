import { RULES_TOOL } from '../tool.mjs';
import { parseEffect, pathPhrase } from './subject.mjs';

const DATABASE_ADVICE =
  'Batch it: fetch or write all items in one query (`WHERE id IN (...)`, `in_bulk`, `bulk_create`, `bulk_update`, `executemany`, a join or `selectinload`). Running the calls concurrently still sends one query per item, whether in `asyncio.gather` or a task group.';
const REMOTE_ADVICE =
  'Batch it: use an endpoint that takes all items in one request; when there is none, bound the concurrency instead of running one request per item in a row: an `asyncio.Semaphore` (or anyio and trio `CapacityLimiter`) inside the task, a `ThreadPoolExecutor(max_workers=n)`, or fixed-size chunks of the items. A plain `asyncio.gather` over every item has no bound.';

function describe(subject) {
  const { path, fields } = parseEffect(subject);
  const [kind, mode] = fields;
  const effect = kind === 'database' ? 'a database query' : 'a remote request';
  const concurrent = mode === 'concurrent' ? ', started concurrently' : '';
  return `${pathPhrase(path)} sends ${effect} once per item of a loop${concurrent}`;
}

function allowed(subject) {
  return parseEffect(subject).fields[0] === 'database' ? DATABASE_ADVICE : REMOTE_ADVICE;
}

export const LOOP_IO_HINTS = [{ tool: RULES_TOOL, rules: ['io-in-loop'], describe, allowed }];
