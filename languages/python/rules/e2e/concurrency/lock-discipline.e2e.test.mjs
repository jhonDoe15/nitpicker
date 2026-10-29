import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const scripts = createScripts();
const { outcomes } = scripts;
afterEach(() => {
  scripts.cleanup();
});

const ORDER = 'lock-order-inversion';
const FIELD = 'inconsistent-attribute-locking';
const indented = (body) =>
  body
    .split('\n')
    .map((line) => (line === '' ? '' : `    ${line}`))
    .join('\n');
const store = (body, prelude = 'import threading\n\n\n', init = '') =>
  `${prelude}class Store:\n    def __init__(self):\n        self.a = threading.Lock()\n        self.b = threading.Lock()\n        self.n = 0\n${init}\n${indented(body)}\n`;
const nested = (name, outer, inner, prefix = '') =>
  `${prefix}def ${name}(self):\n    with ${outer}:\n        with ${inner}:\n            self.n += 1\n`;
const order = (line, subject, via) => `${ORDER}:${String(line)} ${subject} via ${via}`;
const field = (line, subject, via) => `${FIELD}:${String(line)} ${subject} via ${via}`;
const takes = (method, inner, outer, other) =>
  `\`${method}\` takes \`${inner}\` while it holds \`${outer}\`, and ${other} takes \`${outer}\` while it holds \`${inner}\``;

describe.skipIf(!enabled)('lock-order-inversion', () => {
  it('flags two locks of one class taken in opposite orders, in every supported form', () => {
    const [actual, expected] = outcomes([
      [
        'threading locks in two methods',
        store(`${nested('one', 'self.a', 'self.b')}\n${nested('two', 'self.b', 'self.a')}`),
        [
          order(12, 'Store.one: self.a -> self.b', takes('one', 'self.b', 'self.a', '`two`')),
          order(17, 'Store.two: self.b -> self.a', takes('two', 'self.a', 'self.b', '`one`')),
        ],
      ],
      [
        'one with statement with two items',
        store(
          `${nested('one', 'self.a', 'self.b')}\ndef two(self):\n    with self.b, self.a:\n        self.n = 0`,
        ),
        [
          order(12, 'Store.one: self.a -> self.b', takes('one', 'self.b', 'self.a', '`two`')),
          order(16, 'Store.two: self.b -> self.a', takes('two', 'self.a', 'self.b', '`one`')),
        ],
      ],
      [
        'asyncio locks in async with',
        store(
          'async def one(self):\n    async with self.a:\n        async with self.b:\n            self.n += 1\n\nasync def two(self):\n    async with self.b:\n        async with self.a:\n            self.n -= 1',
          'import asyncio\nimport threading\n\n\n',
          '        self.a = asyncio.Lock()\n        self.b = asyncio.Lock()\n',
        ),
        [
          order(15, 'Store.one: self.a -> self.b', takes('one', 'self.b', 'self.a', '`two`')),
          order(20, 'Store.two: self.b -> self.a', takes('two', 'self.a', 'self.b', '`one`')),
        ],
      ],
      [
        'aliased imports, RLock, Condition and a one-slot semaphore',
        store(
          `${nested('one', 'self.a', 'self.b')}\n${nested('two', 'self.b', 'self.a')}`,
          'import threading as t\nfrom threading import Condition, RLock\n\n\n',
          '        self.a = RLock()\n        self.b = Condition()\n',
        ).replaceAll('threading.Lock()', 't.Semaphore(1)'),
        [
          order(15, 'Store.one: self.a -> self.b', takes('one', 'self.b', 'self.a', '`two`')),
          order(20, 'Store.two: self.b -> self.a', takes('two', 'self.a', 'self.b', '`one`')),
        ],
      ],
      [
        'a class lock and two nestings of one method',
        store(
          'def one(self):\n    with Registry.LOCK:\n        with self.a:\n            self.n += 1\n    with self.a:\n        with Registry.LOCK:\n            self.n -= 1',
          'import threading\n\n\nclass Registry:\n    LOCK = threading.Lock()\n\n\n',
        ),
        [
          order(
            16,
            'Store.one: Registry.LOCK -> self.a',
            takes('one', 'self.a', 'Registry.LOCK', 'another nesting in `one`'),
          ),
          order(
            19,
            'Store.one: self.a -> Registry.LOCK',
            takes('one', 'Registry.LOCK', 'self.a', 'another nesting in `one`'),
          ),
        ],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes a consistent order, one lock, a re-acquire and locks it cannot identify', () => {
    const [actual, expected] = outcomes([
      [
        'a consistent order',
        store(`${nested('one', 'self.a', 'self.b')}\n${nested('two', 'self.a', 'self.b')}`),
        [],
      ],
      ['a single lock', store(nested('one', 'self.a', 'self.a')), []],
      [
        'a lock passed in',
        store(
          `${nested('one', 'self.a', 'self.c')}\n${nested('two', 'self.c', 'self.a')}`,
          'import threading\n\n\n',
          '\n    def attach(self, lock):\n        self.c = lock\n',
        ),
        [],
      ],
      [
        'a parameter and a local',
        store(
          'def one(self, lock):\n    with self.a:\n        with lock:\n            self.n += 1\n\ndef two(self, lock):\n    with lock:\n        with self.a:\n            self.n -= 1',
        ),
        [],
      ],
      [
        'a nested function that runs later',
        store(
          'def one(self):\n    with self.a:\n        def later():\n            with self.b:\n                self.n += 1\n        return later\n\n' +
            nested('two', 'self.b', 'self.a'),
        ),
        [],
      ],
      [
        'a semaphore of two slots and a context manager that is no lock',
        store(
          `${nested('one', 'self.a', 'self.b')}\n${nested('two', 'self.b', 'self.a')}`,
          'import threading\n\n\n',
          '        self.a = threading.Semaphore(2)\n',
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('inconsistent-attribute-locking', () => {
  it('flags an attribute written under a lock in one method and without it in another', () => {
    const [actual, expected] = outcomes([
      [
        'a threading lock',
        store(
          'def add(self):\n    with self.a:\n        self.n += 1\n\ndef reset(self):\n    self.n = 0',
        ),
        [
          field(
            15,
            'Store.reset: self.n',
            '`reset` writes `self.n` without a lock, while `add` writes it holding `self.a`',
          ),
        ],
      ],
      [
        'an asyncio lock, a tuple target and an annotated write',
        store(
          'async def add(self):\n    async with self.a:\n        self.n += 1\n\ndef reset(self):\n    self.n, self.m = 0, 0\n\ndef clear(self):\n    self.n: int = 0',
          'import asyncio\nimport threading\n\n\n',
          '        self.a = asyncio.Lock()\n',
        ),
        [
          field(
            17,
            'Store.reset: self.n',
            '`reset` writes `self.n` without a lock, while `add` writes it holding `self.a`',
          ),
          field(
            20,
            'Store.clear: self.n',
            '`clear` writes `self.n` without a lock, while `add` writes it holding `self.a`',
          ),
        ],
      ],
      [
        'the same method outside its lock',
        store('def add(self):\n    with self.a:\n        self.n += 1\n    self.n -= 1'),
        [
          field(
            13,
            'Store.add: self.n',
            '`add` writes `self.n` without a lock, while `add` writes it holding `self.a`',
          ),
        ],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes writes that are all locked, all unlocked, in construction, or in an unknown context', () => {
    const [actual, expected] = outcomes([
      [
        'all writes locked',
        store(
          'def add(self):\n    with self.a:\n        self.n += 1\n\ndef reset(self):\n    with self.b:\n        self.n = 0',
        ),
        [],
      ],
      [
        'all writes unlocked',
        store('def add(self):\n    self.n += 1\n\ndef reset(self):\n    self.n = 0'),
        [],
      ],
      [
        'construction writes',
        store(
          'def __post_init__(self):\n    self.n = 2\n\ndef add(self):\n    with self.a:\n        self.n += 1',
        ),
        [],
      ],
      [
        'a helper called under the lock',
        store(
          'def add(self):\n    with self.a:\n        self.bump()\n        self.n = 0\n\ndef bump(self):\n    self.n += 1',
        ),
        [],
      ],
      [
        'a nested function and a lock that is no lock',
        store(
          'def add(self, lock):\n    with self.a:\n        self.n += 1\n    def later():\n        self.n = 0\n    with lock:\n        self.n = 1\n    return later',
        ),
        [],
      ],
      [
        'another object and a class method',
        store(
          'def add(self, other):\n    with self.a:\n        self.n += 1\n    other.n = 0\n\n@classmethod\ndef build(cls):\n    cls.n = 0',
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
