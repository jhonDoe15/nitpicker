import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const own = createScripts({ hidden: ['module-level-mutable-state'] });
const all = createScripts();
const { outcomes } = own;
afterEach(() => {
  own.cleanup();
  all.cleanup();
});

const RULE = 'atomic-update-across-await';
const indented = (body) =>
  body
    .split('\n')
    .map((line) => `        ${line}`)
    .join('\n');
const method = (body, prelude = '') =>
  `${prelude}class Store:\n    async def run(self, fetch, key=None, *, flag=False):\n${indented(body)}\n`;
const function_ = (body, prelude = '') =>
  `${prelude}async def run(fetch, key=None):\n${indented(body).replaceAll('        ', '    ')}\n`;
const at = (line, subject) => [`${RULE}:${String(line)} ${subject}`];
const inRun = (line, subject) => at(line, `${subject} in run`);

describe.skipIf(!enabled)('atomic-update-across-await', () => {
  it('flags a shared value updated from a read made before an await', () => {
    const [actual, expected] = outcomes([
      ['augmented attribute', method('self.total += await fetch()'), inRun(3, 'self.total')],
      [
        'the read written out',
        method('self.total = self.total + await fetch()'),
        inRun(3, 'self.total'),
      ],
      [
        'the read passed to the awaited call',
        method('self.total = await fetch(self.total)'),
        inRun(3, 'self.total'),
      ],
      [
        'a method called on the read value',
        method('self.report = self.report.merge(await fetch())'),
        inRun(3, 'self.report'),
      ],
      [
        'a nested attribute',
        method('self.stats.total += await fetch()'),
        inRun(3, 'self.stats.total'),
      ],
      [
        'a subscript of self',
        method('self.items[key] = self.items.get(key, 0) + await fetch()'),
        inRun(3, 'self.items[key]'),
      ],
      [
        'a read saved before the await',
        method('current = self.total\ndelta = await fetch()\nself.total = current + delta'),
        inRun(5, 'self.total'),
      ],
      [
        'a read saved and the await in a branch',
        method('current = self.total\nif flag:\n    await fetch()\nself.total = current + 1'),
        inRun(6, 'self.total'),
      ],
      [
        'an update inside a loop and a try',
        method(
          'for _ in range(3):\n    try:\n        self.total += await fetch()\n    finally:\n        pass',
        ),
        inRun(5, 'self.total'),
      ],
      [
        'a read before an async with that is no lock',
        method('current = self.total\nasync with fetch():\n    self.total = current + 1'),
        inRun(5, 'self.total'),
      ],
      [
        'a read saved before the lock is taken',
        method(
          'current = self.total\nasync with self.lock:\n    self.total = current + 1',
          'import asyncio\n\n',
        ),
        inRun(7, 'self.total'),
      ],
      [
        'the read before the await in a conditional expression',
        method('self.total = self.total + (await fetch() if flag else 0)'),
        inRun(3, 'self.total'),
      ],
      [
        'an async comprehension after the read',
        method('self.items = self.items + [x async for x in fetch()]'),
        inRun(3, 'self.items'),
      ],
      [
        'cls in a class method',
        'class Store:\n    @classmethod\n    async def run(cls, fetch):\n        cls.total += await fetch()\n',
        inRun(4, 'cls.total'),
      ],
      [
        'self in a nested function',
        method('async def inner():\n    self.total += await fetch()\nawait inner()'),
        at(4, 'self.total in inner'),
      ],
      [
        'a name declared global',
        function_('global total\ntotal += await fetch()', 'total = 0\n\n\n'),
        inRun(6, 'total'),
      ],
      [
        'an item of a module dict',
        function_('CACHE[key] = CACHE[key] + await fetch()', 'CACHE = {}\n\n\n'),
        inRun(5, 'CACHE[key]'),
      ],
      [
        'an attribute of a module object',
        function_(
          'STATE.count += await fetch()',
          'from types import SimpleNamespace\n\nSTATE = SimpleNamespace(count=0)\n\n\n',
        ),
        inRun(7, 'STATE.count'),
      ],
      [
        'a class attribute through the class name',
        function_('Counter.total += await fetch()', 'class Counter:\n    total = 0\n\n\n'),
        inRun(6, 'Counter.total'),
      ],
      [
        'a nonlocal name',
        'def outer():\n    total = 0\n\n    async def run(fetch):\n        nonlocal total\n        total += await fetch()\n\n    return run\n',
        at(6, 'total in run'),
      ],
      [
        'a test file helper',
        { file: 'tests/test_ledger.py', code: method('self.total += await fetch()') },
        inRun(3, 'self.total'),
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes updates that cannot lose a concurrent change', () => {
    const [actual, expected] = outcomes([
      ['the value awaited first', method('delta = await fetch()\nself.total += delta'), []],
      ['the read after the await', method('self.total = await fetch() + self.total'), []],
      ['an assignment without a read', method('self.total = await fetch()'), []],
      ['an unrelated attribute read', method('self.total = self.base + await fetch()'), []],
      ['tuple unpacking', method('self.low, self.high = await fetch()'), []],
      ['a method that mutates in place', method('self.items.append(await fetch())'), []],
      ['an update without an await', method('self.total += 1'), []],
      [
        'a check then act',
        method('if key not in self.items:\n    self.items[key] = await fetch()'),
        [],
      ],
      [
        'another key of the container',
        method('self.items[key] = self.items["x"] + await fetch()'),
        [],
      ],
      ['a local', function_('total = 0\ntotal += await fetch()\nreturn total'), []],
      [
        'a local object',
        function_('state = {"total": 0}\nstate["total"] += await fetch()\nreturn state'),
        [],
      ],
      ['a parameter object', function_('key.total += await fetch()'), []],
      ['a global only read', function_('value = TOTAL + await fetch()', 'TOTAL = 1\n\n\n'), []],
      [
        'a synchronous function',
        'class Store:\n    def run(self, fetch):\n        self.total += fetch()\n',
        [],
      ],
      [
        'the other arm of a conditional expression',
        method('self.total = self.total if flag else await fetch()'),
        [],
      ],
      [
        'a saved read replaced before the write',
        method('current = self.total\ncurrent = await fetch()\nself.total = current + 1'),
        [],
      ],
      [
        'a saved read that the write ignores',
        method('current = self.total\nawait fetch()\nself.total = 0\nreturn current'),
        [],
      ],
      [
        'a saved read written without an await between',
        method('current = self.total\nself.total = current + 1\nawait fetch()'),
        [],
      ],
      [
        'a saved value restored after the location was set on purpose',
        method(
          'previous = self.state\nself.state = "running"\nawait fetch()\nself.state = previous',
        ),
        [],
      ],
      [
        'a lambda that awaits nothing here',
        method('self.handler = lambda: self.total + 1\nawait fetch()'),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes updates the whole of which a lock serializes', () => {
    const lock = 'import asyncio\n\n';
    const [actual, expected] = outcomes([
      [
        'a lock built in the file',
        method('async with self.lock:\n    self.total += await fetch()', lock),
        [],
      ],
      [
        'a module lock',
        function_(
          'async with LOCK:\n    CACHE[key] = CACHE[key] + await fetch()',
          `${lock}LOCK = asyncio.Lock()\nCACHE = {}\n\n\n`,
        ),
        [],
      ],
      [
        'a lock named as one',
        method('async with self.table_lock:\n    self.total += await fetch()'),
        [],
      ],
      [
        'a semaphore from an import alias',
        method(
          'async with self.slots:\n    self.total += await fetch()',
          'import asyncio as aio\n\nSLOTS = aio.Semaphore(1)\n\n',
        ).replace('self.slots', 'SLOTS'),
        [],
      ],
      [
        'a read saved inside the lock',
        method(
          'async with self.lock:\n    current = self.total\n    delta = await fetch()\n    self.total = current + delta',
          lock,
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('flags an update under a semaphore or limiter that admits more than one task', () => {
    const counter = (gate, enter = 'self.gate') =>
      `import asyncio\nimport anyio\n\n\nclass Counter:\n    def __init__(self):\n        self.gate = ${gate}\n\n` +
      `    async def run(self, fetch):\n        async with ${enter}:\n            self.total += await fetch()\n`;
    const [actual, expected] = outcomes([
      ['a semaphore of two', counter('asyncio.Semaphore(2)'), inRun(11, 'self.total')],
      [
        'a bounded semaphore of two',
        counter('asyncio.BoundedSemaphore(value=2)'),
        inRun(11, 'self.total'),
      ],
      ['a limiter of five', counter('anyio.CapacityLimiter(5)'), inRun(11, 'self.total')],
      ['a semaphore of unknown size', counter('anyio.Semaphore(size)'), inRun(11, 'self.total')],
      [
        'a lock-named semaphore of two',
        counter('asyncio.Semaphore(2)').replaceAll('gate', 'lock'),
        inRun(11, 'self.total'),
      ],
      ['a semaphore named as one', counter('None', 'self.semaphore'), inRun(11, 'self.total')],
      ['a lock built per call', counter('None', 'asyncio.Lock()'), inRun(11, 'self.total')],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes an update under a semaphore or limiter of one slot', () => {
    const counter = (gate) =>
      `import asyncio\nimport anyio\nimport trio\n\n\nclass Counter:\n    def __init__(self):\n        self.gate = ${gate}\n\n` +
      `    async def run(self, fetch):\n        async with self.gate:\n            self.total += await fetch()\n`;
    const [actual, expected] = outcomes([
      ['the default asyncio semaphore', counter('asyncio.Semaphore()'), []],
      ['a bounded semaphore of one', counter('asyncio.BoundedSemaphore(value=1)'), []],
      ['an anyio limiter of one', counter('anyio.CapacityLimiter(1)'), []],
      ['a trio semaphore of one', counter('trio.Semaphore(initial_value=1)'), []],
      ['a trio strict lock', counter('trio.StrictFIFOLock()'), []],
    ]);
    expect(actual).toEqual(expected);
  });

  it('keeps the finding apart from the module state rule on the same line', () => {
    const code =
      'CACHE = {}\n\n\nasync def run(key, fetch):\n    CACHE[key] = CACHE[key] + await fetch()\n';

    expect(all.findingsOf({ 'src/shop/cache.py': code }, { sourceRoots: ['src'] })).toEqual([
      `${RULE} src/shop/cache.py:5 CACHE[key] in run`,
      'module-level-mutable-state src/shop/cache.py:5 CACHE in run',
    ]);
  });
});
