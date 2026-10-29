import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({ hidden: ['swallowed-exception'] });
afterEach(cleanup);

const WAIT = 'timeout-abandons-operation:3 asyncio.wait(timeout=...)';
const FIRST = 'timeout-abandons-operation:3 asyncio.wait(return_when=FIRST_COMPLETED)';
const SHIELD = (inner, line = 4) =>
  `timeout-abandons-operation:${String(line)} asyncio.wait_for(asyncio.shield(${inner}))`;

function body(lines, header = 'import asyncio') {
  return [
    header,
    'async def run(tasks, owner, logger, work):',
    ...lines.map((l) => `    ${l}`),
    '',
  ].join('\n');
}

const WAIT_CASES = [
  [
    'pending unused',
    ['done, pending = await asyncio.wait(tasks, timeout=5)', 'return done'],
    [WAIT],
  ],
  [
    'pending only counted',
    ['done, pending = await asyncio.wait(tasks, timeout=5)', 'owner.count(len(pending))'],
    [WAIT],
  ],
  [
    'pending only tested',
    ['done, pending = await asyncio.wait(tasks, timeout=5)', 'if pending:', '    owner.flag = 1'],
    [WAIT],
  ],
  [
    'pending only logged',
    ['done, pending = await asyncio.wait(tasks, timeout=5)', 'logger.warning("late %s", pending)'],
    [WAIT],
  ],
  [
    'loop only logs',
    [
      'done, pending = await asyncio.wait(tasks, timeout=5)',
      'for task in pending:',
      '    logger.warning("late %s", task)',
    ],
    [WAIT],
  ],
  ['result dropped', ['await asyncio.wait(tasks, timeout=5)'], [WAIT]],
  ['pending discarded', ['done, _ = await asyncio.wait(tasks, timeout=5)'], [WAIT]],
  [
    'first completed',
    ['done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)'],
    [FIRST],
  ],
  [
    'pending cleared',
    ['done, pending = await asyncio.wait(tasks, timeout=5)', 'pending.clear()'],
    [WAIT],
  ],
  [
    'pending copied',
    ['done, pending = await asyncio.wait(tasks, timeout=5)', 'owner.seen = pending.copy()'],
    [WAIT],
  ],
  ['starred rest unused', ['done, *rest = await asyncio.wait(tasks, timeout=5)'], [WAIT]],
  ['starred rest discarded', ['done, *_ = await asyncio.wait(tasks, timeout=5)'], [WAIT]],
  [
    'starred rest gathered',
    ['done, *rest = await asyncio.wait(tasks, timeout=5)', 'await asyncio.gather(*rest[0])'],
    [],
  ],
  [
    'awaited tasks cancelled',
    [
      'done, pending = await asyncio.wait(tasks, timeout=5)',
      'for task in tasks:',
      '    task.cancel()',
    ],
    [],
  ],
  [
    'awaited tasks cancelled in finally',
    [
      'try:',
      '    done, _ = await asyncio.wait(tasks, timeout=5)',
      'finally:',
      '    for task in tasks:',
      '        task.cancel()',
    ],
    [],
  ],
  [
    'task group owns its tasks',
    ['async with asyncio.TaskGroup() as group:', '    group.create_task(work())'],
    [],
  ],
  [
    'cancelled in a loop',
    [
      'done, pending = await asyncio.wait(tasks, timeout=5)',
      'for task in pending:',
      '    task.cancel()',
    ],
    [],
  ],
  [
    'cancelled in a comprehension',
    ['done, pending = await asyncio.wait(tasks, timeout=5)', '[task.cancel() for task in pending]'],
    [],
  ],
  [
    'gathered',
    ['done, pending = await asyncio.wait(tasks, timeout=5)', 'await asyncio.gather(*pending)'],
    [],
  ],
  [
    'handed to an owner',
    ['done, pending = await asyncio.wait(tasks, timeout=5)', 'owner.background.update(pending)'],
    [],
  ],
  ['stored on an attribute', ['done, owner.pending = await asyncio.wait(tasks, timeout=5)'], []],
  ['returned whole', ['return await asyncio.wait(tasks, timeout=5)'], []],
  ['whole result kept', ['result = await asyncio.wait(tasks, timeout=5)', 'return result'], []],
  ['no timeout', ['done, _ = await asyncio.wait(tasks)'], []],
  [
    'no timeout all completed',
    ['done, _ = await asyncio.wait(tasks, return_when=asyncio.ALL_COMPLETED)'],
    [],
  ],
  ['timeout none', ['done, _ = await asyncio.wait(tasks, timeout=None)'], []],
  ['wait_for cancels', ['return await asyncio.wait_for(tasks[0], 5)'], []],
  ['timeout scope cancels', ['async with asyncio.timeout(5):', '    return await work()'], []],
  [
    'cancelled in a nested function',
    [
      'done, pending = await asyncio.wait(tasks, timeout=5)',
      'def stop():',
      '    for task in pending:',
      '        task.cancel()',
      'owner.stop = stop',
    ],
    [],
  ],
];

const SHIELD_CASES = [
  [
    'shield of a call',
    ['return await asyncio.wait_for(asyncio.shield(work()), 5)'],
    [SHIELD('...', 3)],
  ],
  [
    'shield of a created task',
    [
      'task = asyncio.ensure_future(work())',
      'return await asyncio.wait_for(asyncio.shield(task), 5)',
    ],
    [SHIELD('task')],
  ],
  [
    'task cancelled after timeout',
    [
      'task = asyncio.ensure_future(work())',
      'try:',
      '    return await asyncio.wait_for(asyncio.shield(task), 5)',
      'except asyncio.TimeoutError:',
      '    task.cancel()',
      '    raise',
    ],
    [],
  ],
  [
    'task awaited after timeout',
    [
      'task = asyncio.create_task(work())',
      'try:',
      '    return await asyncio.wait_for(asyncio.shield(task), 5)',
      'except asyncio.TimeoutError:',
      '    return await task',
    ],
    [],
  ],
  [
    'annotated task',
    [
      'task: asyncio.Task[str] = asyncio.create_task(work())',
      'return await asyncio.wait_for(asyncio.shield(task), 5)',
    ],
    [SHIELD('task')],
  ],
  ['no timeout', ['return await asyncio.wait_for(asyncio.shield(work()), None)'], []],
  [
    'keyword no timeout',
    ['return await asyncio.wait_for(asyncio.shield(work()), timeout=None)'],
    [],
  ],
  ['task owned by the caller', ['return await asyncio.wait_for(asyncio.shield(tasks), 5)'], []],
  ['shield on an attribute', ['return await asyncio.wait_for(asyncio.shield(owner.task), 5)'], []],
];

const OTHER_BACKENDS = [
  [
    'trio and anyio scopes',
    [
      'with trio.move_on_after(5):',
      '    await work()',
      'with anyio.fail_after(5):',
      '    await work()',
    ],
    [],
    'import trio\nimport anyio',
  ],
  [
    'shadowed module is not asyncio',
    ['done, pending = await asyncio.wait(tasks, timeout=5)'],
    [],
    'from . import asyncio',
  ],
];

function code(rows) {
  return rows.map(([name, lines, expected, header]) => [name, body(lines, header), expected]);
}

describe.skipIf(!enabled)('timeouts that abandon work in Python', () => {
  it('reports an asyncio wait whose pending tasks are left running', () => {
    const [actual, expected] = outcomes(code(WAIT_CASES));

    expect(actual).toEqual(expected);
  });

  it('reports a shielded wait that nothing cancels or awaits afterwards', () => {
    const [actual, expected] = outcomes(code(SHIELD_CASES));

    expect(actual).toEqual(expected);
  });

  it('leaves other backends and shadowed names alone', () => {
    const [actual, expected] = outcomes(code(OTHER_BACKENDS));

    expect(actual).toEqual(expected);
  });
});
