import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({
  hidden: ['swallowed-exception', 'retry-without-idempotency', 'unbounded-fan-out'],
});
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;
const HEAD = [
  'import asyncio',
  'import anyio',
  'import trio',
  'from concurrent.futures import ThreadPoolExecutor',
  '',
  'from shop.db import session',
  '',
  '',
  'def find_sync(user_id):',
  '    return session.get(User, user_id)',
  '',
  '',
  'async def find(user_id):',
  '    return await session.get(User, user_id)',
  '',
  '',
];
const body = (...lines) => code(...HEAD, ...lines);

describe.skipIf(!enabled)('io-in-loop on callables handed to a task group or a thread', () => {
  it('reports a query function started once per item', () => {
    const [actual, expected] = outcomes([
      [
        'anyio start_soon in a loop',
        body(
          'async def run(ids):',
          '    async with anyio.create_task_group() as group:',
          '        for user_id in ids:',
          '            group.start_soon(find, user_id)',
        ),
        ['io-in-loop:20 find() > session.get()|database|concurrent'],
      ],
      [
        'trio nursery start_soon in a comprehension',
        body(
          'async def run(ids, nursery):',
          '    [nursery.start_soon(find, user_id) for user_id in ids]',
        ),
        ['io-in-loop:18 find() > session.get()|database|concurrent'],
      ],
      [
        'to_thread inside gather',
        body(
          'async def run(ids):',
          '    return await asyncio.gather(*(asyncio.to_thread(find_sync, i) for i in ids))',
        ),
        ['io-in-loop:18 find_sync() > session.get()|database|concurrent'],
      ],
      [
        'run_in_executor inside gather',
        body(
          'async def run(ids):',
          '    loop = asyncio.get_running_loop()',
          '    return await asyncio.gather(*[loop.run_in_executor(None, find_sync, i) for i in ids])',
        ),
        ['io-in-loop:19 find_sync() > session.get()|database|concurrent'],
      ],
      [
        'to_thread with the item as a keyword',
        body(
          'async def run(ids):',
          '    for user_id in ids:',
          '        await asyncio.to_thread(find_sync, user_id=user_id)',
        ),
        ['io-in-loop:19 find_sync() > session.get()|database|concurrent'],
      ],
      [
        'a nursery start_soon in a loop',
        body(
          'async def run(ids, nursery):',
          '    for user_id in ids:',
          '        nursery.start_soon(find, user_id)',
        ),
        ['io-in-loop:19 find() > session.get()|database|concurrent'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('stays quiet when no item is handed over or the work is not a query', () => {
    const [actual, expected] = outcomes([
      [
        'a worker pool of fixed size',
        body(
          'async def run(queue):',
          '    async with anyio.create_task_group() as group:',
          '        for _ in range(4):',
          '            group.start_soon(find, queue)',
        ),
        [],
      ],
      [
        'a callable that sends nothing',
        body(
          'def shout(text):',
          '    return text.upper()',
          '',
          '',
          'async def run(ids, nursery):',
          '    for user_id in ids:',
          '        nursery.start_soon(shout, user_id)',
        ),
        [],
      ],
      [
        'one start outside any loop',
        body('async def run(user_id, nursery):', '    nursery.start_soon(find, user_id)'),
        [],
      ],
      [
        'a thread pool without a loop',
        body(
          'def run(user_id):',
          '    with ThreadPoolExecutor() as pool:',
          '        return pool.submit(find_sync, user_id)',
        ),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});
