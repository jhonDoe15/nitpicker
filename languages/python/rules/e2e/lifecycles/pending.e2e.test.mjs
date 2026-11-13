import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({ hidden: ['io-in-loop', 'unbounded-collection'] });
afterEach(cleanup);

const RULE = 'pending-unsettled-on-close';
const found = (line, subject) => [`${RULE}:${String(line)} ${subject}`];
const HEAD = 'import asyncio\n\n\nclass Client:\n    def __init__(self):\n';
const SEND = [
  '    async def send(self, key):',
  '        future = asyncio.get_running_loop().create_future()',
  '        self._pending[key] = future',
  '        return await future',
].join('\n');
const client = (init, close) => `${HEAD}        ${init}\n\n${SEND}\n\n${close}\n`;
const closeWith = (body) => `    async def close(self):\n${body}`;

describe.skipIf(!enabled)('pending-unsettled-on-close', () => {
  it('reports futures kept for pending requests that close never fails', () => {
    const cases = [
      [
        'cleared only',
        client('self._pending = {}', closeWith('        self._pending.clear()')),
        found(6, 'Client._pending: close'),
      ],
      [
        'annotated future dict',
        `${HEAD}        self._pending: dict[str, asyncio.Future] = {}\n\n    async def aclose(self):\n        self._pending.clear()\n`,
        found(6, 'Client._pending: aclose'),
      ],
      [
        'future built by the constructor',
        `${HEAD}        self._pending = {}\n\n    def send(self, key):\n        self._pending[key] = asyncio.Future()\n\n    def stop(self):\n        self._pending = {}\n`,
        found(6, 'Client._pending: stop'),
      ],
    ];
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
  });

  it('accepts a close that fails the futures, directly or through a helper', () => {
    const fail =
      '        for future in self._pending.values():\n            future.set_exception(ConnectionError("closed"))';
    const cases = [
      ['loop in close', client('self._pending = {}', closeWith(fail)), []],
      [
        'cancel in a comprehension loop',
        client(
          'self._pending = {}',
          closeWith(
            '        for key, future in list(self._pending.items()):\n            future.cancel()',
          ),
        ),
        [],
      ],
      [
        'helper method',
        client(
          'self._pending = {}',
          `${closeWith('        self._fail_all()')}\n\n    def _fail_all(self):\n${fail}`,
        ),
        [],
      ],
      [
        'popitem loop',
        client(
          'self._pending = {}',
          closeWith(
            '        while self._pending:\n            _, future = self._pending.popitem()\n            future.set_exception(ConnectionError("closed"))',
          ),
        ),
        [],
      ],
      [
        'alias of the dict',
        client(
          'self._pending = {}',
          closeWith(
            '        pending = self._pending\n        for future in pending.values():\n            future.cancel()',
          ),
        ),
        [],
      ],
      [
        'dict handed to a function',
        client('self._pending = {}', closeWith('        fail_all(self._pending)')),
        [],
      ],
      [
        'values that are not futures',
        `${HEAD}        self._names = {}\n\n    def note(self, key, name):\n        self._names[key] = name\n\n    def close(self):\n        self._names.clear()\n`,
        [],
      ],
      ['a class without a close function', `${HEAD}        self._pending = {}\n\n${SEND}\n`, []],
    ];
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
  });
});
