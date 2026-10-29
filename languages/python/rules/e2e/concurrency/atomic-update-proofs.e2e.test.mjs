import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { outcomes, cleanup } = createScripts({
  hidden: ['module-level-mutable-state', 'frozen-dataclass', 'swallowed-exception'],
});
afterEach(cleanup);

const RULE = 'atomic-update-across-await';
const lines = (...rows) => `${rows.join('\n')}\n`;
const body = (text, depth) =>
  text
    .split('\n')
    .map((line) => `${' '.repeat(depth)}${line}`)
    .join('\n');
const run = (text) =>
  lines(
    'import asyncio',
    '',
    '',
    'class Store:',
    '    async def run(self, fetch, flag=False):',
    body(text, 8),
  );
const gated = (init, enter = 'self.gate', imports = 'import asyncio') =>
  lines(
    imports,
    '',
    '',
    'class Store:',
    '    def __init__(self, gate=None, size=1):',
    body(init, 8),
    '',
    '    async def run(self, fetch):',
    `        async with ${enter}:`,
    '            self.total += await fetch()',
  );
const total = (line) => [`${RULE}:${String(line)} self.total in run`];

describe.skipIf(!enabled)('atomic-update-across-await lock proofs', () => {
  it('trusts only a lock every assignment of which builds an exclusive one outside the method', () => {
    const [actual, expected] = outcomes([
      [
        'a lock built in the method',
        run('lock = asyncio.Lock()\nasync with lock:\n    self.total += await fetch()'),
        total(8),
      ],
      [
        'a semaphore of one built in the method',
        run('gate = asyncio.Semaphore(1)\nasync with gate:\n    self.total += await fetch()'),
        total(8),
      ],
      [
        'an attribute lock rebuilt in the method',
        run('self.lock = asyncio.Lock()\nasync with self.lock:\n    self.total += await fetch()'),
        total(8),
      ],
      [
        'a tuple assignment of a wider semaphore',
        gated('self.gate, self.other = asyncio.Semaphore(2), asyncio.Lock()'),
        total(10),
      ],
      [
        'a conditional construction',
        gated('self.gate = asyncio.Semaphore(2) if size else asyncio.Lock()'),
        total(10),
      ],
      ['a factory call', gated('self.gate = make(1)'), total(10)],
      [
        'a fallback to a wider semaphore',
        gated('self.gate = gate or asyncio.Semaphore(2)'),
        total(10),
      ],
      ['an injected lock named as one', gated('self.lock = gate', 'self.lock'), total(10)],
      [
        'a lock parameter',
        lines(
          'total = 0',
          '',
          '',
          'async def run(lock, fetch):',
          '    global total',
          '    async with lock:',
          '        total += await fetch()',
        ),
        [`${RULE}:7 total in run`],
      ],
      [
        'a limiter widened after construction',
        gated(
          'self.gate = anyio.CapacityLimiter(1)\nself.gate.total_tokens = 5',
          'self.gate',
          'import anyio',
        ),
        total(11),
      ],
      [
        'a semaphore of two inherited from a base class',
        lines(
          'import asyncio',
          '',
          '',
          'class Base:',
          '    def __init__(self):',
          '        self.gate = asyncio.Semaphore(2)',
          '',
          '',
          'class Store(Base):',
          '    async def run(self, fetch):',
          '        async with self.gate:',
          '            self.total += await fetch()',
        ),
        total(12),
      ],
      [
        'a dataclass field of a wider semaphore',
        lines(
          'import asyncio',
          'from dataclasses import dataclass, field',
          '',
          '',
          '@dataclass',
          'class Store:',
          '    gate: asyncio.Semaphore = field(default_factory=lambda: asyncio.Semaphore(2))',
          '',
          '    async def run(self, fetch):',
          '        async with self.gate:',
          '            self.total += await fetch()',
        ),
        total(11),
      ],
      [
        'an injected dataclass lock',
        lines(
          'import asyncio',
          'from dataclasses import dataclass',
          '',
          '',
          '@dataclass',
          'class Store:',
          '    lock: asyncio.Lock',
          '',
          '    async def run(self, fetch):',
          '        async with self.lock:',
          '            self.total += await fetch()',
        ),
        total(11),
      ],
      ['a plain dict of locks', gated('self.locks = {}', 'self.locks[0]'), total(10)],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes a lock proven exclusive and shared', () => {
    const [actual, expected] = outcomes([
      ['a lock built in __init__', gated('self.gate = asyncio.Lock()'), []],
      [
        'a tuple of an exclusive lock and another',
        gated('self.gate, self.other = asyncio.Lock(), asyncio.Semaphore(3)'),
        [],
      ],
      ['a local of __init__', gated('lock = asyncio.Lock()\nself.gate = lock'), []],
      [
        'a module lock assigned in __init__',
        gated('self.gate = GATE', 'self.gate', 'import asyncio\n\nGATE = asyncio.Lock()'),
        [],
      ],
      [
        'a per-key lock table',
        gated(
          'self.locks = defaultdict(asyncio.Lock)',
          'self.locks[0]',
          'import asyncio\nfrom collections import defaultdict',
        ),
        [],
      ],
      [
        'a class-level lock through self and cls',
        lines(
          'import asyncio',
          '',
          '',
          'class Store:',
          '    gate = asyncio.Lock()',
          '',
          '    async def run(self, fetch):',
          '        async with self.gate:',
          '            self.total += await fetch()',
          '',
          '    @classmethod',
          '    async def reset(cls, fetch):',
          '        async with cls.gate:',
          '            cls.total = cls.total + await fetch()',
        ),
        [],
      ],
      [
        'a lock of the same name in another class',
        lines(
          'import asyncio',
          '',
          '',
          'class Pool:',
          '    def __init__(self):',
          '        self._lock = asyncio.Semaphore(10)',
          '',
          '',
          'class Store:',
          '    def __init__(self):',
          '        self._lock = asyncio.Lock()',
          '',
          '    async def run(self, fetch):',
          '        async with self._lock:',
          '            self.total += await fetch()',
        ),
        [],
      ],
      [
        'a dataclass lock factory',
        lines(
          'import asyncio',
          'from dataclasses import dataclass, field',
          '',
          '',
          '@dataclass',
          'class Store:',
          '    gate: asyncio.Lock = field(default_factory=asyncio.Lock)',
          '',
          '    async def run(self, fetch):',
          '        async with self.gate:',
          '            self.total += await fetch()',
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('treats waiting on the held condition as releasing it', () => {
    const condition = (text, imports = 'import asyncio', build = 'asyncio.Condition()') =>
      lines(
        imports,
        '',
        '',
        'class Store:',
        '    def __init__(self):',
        `        self.cond = ${build}`,
        '',
        '    async def run(self, ready):',
        '        async with self.cond:',
        body(text, 12),
      );
    const [actual, expected] = outcomes([
      [
        'a read saved before wait',
        condition('current = self.total\nawait self.cond.wait()\nself.total = current + 1'),
        total(12),
      ],
      [
        'an update across wait_for',
        condition('self.total += await self.cond.wait_for(ready)'),
        total(10),
      ],
      [
        'a trio condition',
        condition('self.total += await self.cond.wait()', 'import trio', 'trio.Condition()'),
        total(10),
      ],
      [
        'an anyio condition',
        condition('self.total += await self.cond.wait()', 'import anyio', 'anyio.Condition()'),
        total(10),
      ],
      ['a read after wait', condition('await self.cond.wait()\nself.total += 1'), []],
    ]);
    expect(actual).toEqual(expected);
  });

  it('follows a read saved in a local through the statements that use it', () => {
    const [actual, expected] = outcomes([
      [
        'a derived local',
        run(
          'current = self.total\nnext_total = current + 1\nawait fetch()\nself.total = next_total',
        ),
        total(9),
      ],
      [
        'a local changed after the await',
        run('current = self.total\nawait fetch()\ncurrent += 1\nself.total = current'),
        total(9),
      ],
      [
        'a local accumulated across an await',
        run('current = self.total\ncurrent += await fetch()\nself.total = current'),
        total(8),
      ],
      [
        'an annotated local',
        run('current: int = self.total\nawait fetch()\nself.total = current + 1'),
        total(8),
      ],
      [
        'a tuple target',
        run('current, other = self.total, 0\nawait fetch()\nself.total = current + 1'),
        total(8),
      ],
      [
        'a walrus',
        run('if (current := self.total) > 0:\n    await fetch()\n    self.total = current + 1'),
        total(8),
      ],
      [
        'a write in finally',
        run(
          'current = self.total\ntry:\n    await fetch()\nfinally:\n    self.total = current + 1',
        ),
        total(10),
      ],
      [
        'a write in a handler',
        run(
          'current = self.total\ntry:\n    await fetch()\nexcept ValueError:\n    self.total = current + 1',
        ),
        total(10),
      ],
      [
        'a write in else',
        run(
          'current = self.total\ntry:\n    await fetch()\nexcept ValueError:\n    pass\nelse:\n    self.total = current + 1',
        ),
        total(12),
      ],
      [
        'a read carried to the next iteration',
        run(
          'current = 0\nfor _ in range(3):\n    self.total = current + 1\n    current = self.total\n    await fetch()',
        ),
        total(8),
      ],
      [
        'a local set in a branch',
        run(
          'if flag:\n    current = self.total\nelse:\n    current = 0\nawait fetch()\nself.total = current',
        ),
        total(11),
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes locals that no longer hold the read', () => {
    const [actual, expected] = outcomes([
      [
        'the other element of a tuple',
        run('other, current = self.total, 0\nawait fetch()\nself.total = current + 1'),
        [],
      ],
      [
        'a local replaced by the awaited value',
        run('current = self.total\ncurrent = await fetch()\nself.total = current + 1'),
        [],
      ],
      [
        'the result of an awaited call given the state',
        run('replaced = await fetch(self.total)\nself.total = replaced'),
        [],
      ],
      [
        'an async comprehension over the state',
        run('items = [x async for x in self.items]\nself.items = items'),
        [],
      ],
      [
        'a walrus of a fresh value',
        run(
          'current = self.total\nif (current := 0) == 0:\n    await fetch()\n    self.total = current',
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
