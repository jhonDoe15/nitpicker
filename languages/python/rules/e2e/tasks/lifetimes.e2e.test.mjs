import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';
import { createRuleChecker } from '../../test-support/python-rule-harness.mjs';
import { ingestRulesReport } from '../../../ingest/rules-report.mjs';
import { applyPythonExceptions } from '../../../adapters/configuration/python-exceptions.mjs';
import { applyRuleHints } from '../../rule-hints.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({ hidden: ['io-in-loop'] });
afterEach(cleanup);

const RULE = 'task-outlives-resource';
const HEADER = 'import asyncio\nimport functools\nimport anyio\nimport trio\n';

function code(body) {
  return `${HEADER}\n\nasync def run(path, res):\n${body
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')}\n`;
}

const found = (line, subject) => [`${RULE}:${String(line)} ${subject}`];
const OPEN = 'async with trio.open_nursery() as nursery:\n    with open(path) as handle:\n';
const nested = (statement) => code(`${OPEN}${statement.replace(/^/gmu, '        ')}`);

describe.skipIf(!enabled)('task-outlives-resource in a task group', () => {
  it('reports a resource opened inside the group and handed to a child', () => {
    const cases = [
      [
        'positional argument',
        nested('nursery.start_soon(consume, handle)'),
        found(10, 'handle passed to nursery.start_soon'),
      ],
      [
        'awaited start',
        nested('await nursery.start(consume, 1, handle)'),
        found(10, 'handle passed to nursery.start'),
      ],
      [
        'bound method as the task',
        nested('nursery.start_soon(handle.serve)'),
        found(10, 'handle passed to nursery.start_soon'),
      ],
      [
        'lambda closure',
        nested('nursery.start_soon(lambda: consume(handle))'),
        found(10, 'handle passed to nursery.start_soon'),
      ],
      [
        'functools.partial',
        nested('nursery.start_soon(functools.partial(consume, handle))'),
        found(10, 'handle passed to nursery.start_soon'),
      ],
      [
        'nested function closure',
        nested('async def child():\n    await consume(handle)\n\nnursery.start_soon(child)'),
        found(13, 'handle passed to nursery.start_soon'),
      ],
      [
        'AnyIO task group with an async resource',
        code(
          'async with anyio.create_task_group() as group:\n    async with connect(path) as conn:\n        group.start_soon(serve, conn)',
        ),
        found(10, 'conn passed to group.start_soon'),
      ],
      [
        'asyncio.TaskGroup with a coroutine',
        code(
          'async with asyncio.TaskGroup() as group:\n    with open(path) as handle:\n        group.create_task(consume(handle))',
        ),
        found(10, 'handle passed to group.create_task'),
      ],
      [
        'asyncio.TaskGroup with a coroutine method',
        code(
          'async with asyncio.TaskGroup() as group:\n    with open(path) as handle:\n        group.create_task(handle.serve())',
        ),
        found(10, 'handle passed to group.create_task'),
      ],
      [
        'imported names',
        'from trio import open_nursery\n\n\nasync def run(path):\n    async with open_nursery() as nursery:\n        with open(path) as handle:\n            nursery.start_soon(consume, handle)\n',
        found(7, 'handle passed to nursery.start_soon'),
      ],
      [
        'second item of the same with statement',
        code(
          'async with trio.open_nursery() as nursery, open(path) as handle:\n    nursery.start_soon(consume, handle)',
        ),
        found(9, 'handle passed to nursery.start_soon'),
      ],
    ];
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
  });

  it('accepts an enclosing resource, derived values and scopes', () => {
    const cases = [
      [
        'resource encloses the group',
        code(
          'with open(path) as handle:\n    async with trio.open_nursery() as nursery:\n        nursery.start_soon(consume, handle)',
        ),
        [],
      ],
      [
        'resource listed before the group in one statement',
        code(
          'async with open_resource(path) as handle, trio.open_nursery() as nursery:\n    nursery.start_soon(consume, handle)',
        ),
        [],
      ],
      [
        'value derived from the resource',
        nested(
          'nursery.start_soon(consume, handle.name)\nnursery.start_soon(consume, handle.read())',
        ),
        [],
      ],
      [
        'ownership moved with pop_all',
        code(
          'async with trio.open_nursery() as nursery:\n    with contextlib.ExitStack() as stack:\n        stack.enter_context(open(path))\n        nursery.start_soon(consume, stack.pop_all())',
        ),
        [],
      ],
      [
        'resource opened inside the child',
        code('async with trio.open_nursery() as nursery:\n    nursery.start_soon(child, path)'),
        [],
      ],
      [
        'resource closed before the spawn',
        code(
          'async with trio.open_nursery() as nursery:\n    with open(path) as handle:\n        data = handle.read()\n    nursery.start_soon(consume, data)',
        ),
        [],
      ],
      [
        'resource bound outside the group',
        code('async with trio.open_nursery() as nursery:\n    nursery.start_soon(consume, res)'),
        [],
      ],
      [
        'cancel scope is not a resource',
        code(
          'async with trio.open_nursery() as nursery:\n    with trio.move_on_after(1) as scope:\n        nursery.start_soon(consume, scope)',
        ),
        [],
      ],
      [
        'timeout is not a resource',
        code(
          'async with asyncio.TaskGroup() as group:\n    async with asyncio.timeout(1) as limit:\n        group.create_task(consume(limit))',
        ),
        [],
      ],
      [
        'with without a name',
        code(
          'async with trio.open_nursery() as nursery:\n    with open(path):\n        nursery.start_soon(consume, path)',
        ),
        [],
      ],
      [
        'another group object',
        code(
          'async with trio.open_nursery() as nursery:\n    with open(path) as handle:\n        scheduler.start_soon(consume, handle)',
        ),
        [],
      ],
      [
        'task keyword name is not an argument',
        nested('nursery.start_soon(consume, name=handle)'),
        [],
      ],
      ['helper defined elsewhere is not inferred', nested('nursery.start_soon(adopt(handle))'), []],
    ];
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('task-outlives-resource for asyncio.create_task', () => {
  it('reports a task created inside the with block and never awaited there', () => {
    const cases = [
      [
        'discarded task',
        code('async with res:\n    asyncio.create_task(use(res))'),
        found(9, 'res passed to asyncio.create_task'),
      ],
      [
        'stored but never used',
        code('with open(path) as handle:\n    task = asyncio.create_task(use(handle))\nawait task'),
        found(9, 'handle passed to asyncio.create_task'),
      ],
      [
        'bound method coroutine',
        code('async with res:\n    asyncio.create_task(res.serve())'),
        found(9, 'res passed to asyncio.create_task'),
      ],
      [
        'ensure_future',
        code('async with res:\n    asyncio.ensure_future(use(res))'),
        found(9, 'res passed to asyncio.ensure_future'),
      ],
      [
        'task in a loop',
        code('async with res:\n    for item in path:\n        asyncio.create_task(use(res, item))'),
        found(10, 'res passed to asyncio.create_task'),
      ],
    ];
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
  });

  it('accepts a task awaited or handed on before the block exits', () => {
    const cases = [
      [
        'awaited in the block',
        code('async with res:\n    task = asyncio.create_task(use(res))\n    await task'),
        [],
      ],
      [
        'gathered in the block',
        code(
          'async with res:\n    task = asyncio.create_task(use(res))\n    await asyncio.gather(task)',
        ),
        [],
      ],
      [
        'awaited after a branch',
        code(
          'async with res:\n    task = asyncio.create_task(use(res))\n    if path:\n        await task',
        ),
        [],
      ],
      [
        'task handed to a tracker',
        code('async with res:\n    task = asyncio.create_task(use(res))\n    tracker.add(task)'),
        [],
      ],
      [
        'task returned',
        code('async with res:\n    task = asyncio.create_task(use(res))\n    return task'),
        [],
      ],
      [
        'task collected',
        code('async with res:\n    tasks.append(asyncio.create_task(use(res)))'),
        [],
      ],
      [
        'task does not use the resource',
        code('async with res:\n    asyncio.create_task(other())'),
        [],
      ],
      ['derived value', code('async with res:\n    asyncio.create_task(use(res.name))'), []],
      ['awaited immediately', code('async with res:\n    await asyncio.create_task(use(res))'), []],
      [
        'task created outside the block',
        code('async with res:\n    pass\nasyncio.create_task(use(res))'),
        [],
      ],
      [
        'task group inside the resource',
        code(
          'async with res:\n    async with asyncio.TaskGroup() as group:\n        group.create_task(use(res))',
        ),
        [],
      ],
    ];
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('task-outlives-resource reporting', () => {
  it('passes the registered banned/allowed fixtures through the full AST adapter', () => {
    const check = createRuleChecker();
    const verdict = check({
      tool: 'python-rules',
      fixture: 'task-lifetimes',
      rule: RULE,
      mention: 'around the whole task group',
    });

    expect(verdict).toEqual({
      ok: true,
      messages: [
        '`stream passed to nursery.start_soon`: the resource closes when its `with` block ends, while the child task can still use it. Put the `with` that opens the resource around the whole task group (`async with trio.open_nursery()` or `asyncio.TaskGroup()` inside it), or open the resource inside the child task, or await the task before the block ends. A value derived from the resource (`resource.name`, `stack.pop_all()`) is not reported. If this is intended, add {"rule":"task-outlives-resource","paths":["worker.py"],"reason":"..."} to "python.exceptions" in nitpicker.config.json.',
      ],
    });
  });

  it('keeps the identity across line moves and honours reviewed path exceptions', () => {
    const raw = {
      rule: RULE,
      path: 'src/worker.py',
      subject: 'stream passed to nursery.start_soon',
      line: 5,
    };
    const before = applyRuleHints(ingestRulesReport(JSON.stringify([raw])));
    const after = applyRuleHints(ingestRulesReport(JSON.stringify([{ ...raw, line: 9 }])));

    expect(after).toEqual([{ ...before[0], location: { line: 9 } }]);
    expect(applyPythonExceptions(after, [{ rule: RULE, paths: ['src/worker.py'] }])).toEqual([]);
    expect(applyPythonExceptions(after, [{ rule: RULE, paths: ['other.py'] }])).toEqual(after);
  });
});
