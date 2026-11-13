import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({ hidden: ['io-in-loop', 'unbounded-collection'] });
afterEach(cleanup);

const RULE = 'cached-rejection';
const found = (line, subject) => [`${RULE}:${String(line)} ${subject}`];
const HEAD =
  'import asyncio\nimport functools\n\n\nclass Client:\n    def __init__(self):\n        self._connection = None\n\n';
const connect = (body) => `${HEAD}    async def connect(self):\n${body}\n`;
const GUARD =
  '        if self._connection is not None:\n            return await self._connection\n';

describe.skipIf(!enabled)('cached-rejection', () => {
  it('reports a cached task that keeps its rejection or is cleared blindly', () => {
    const cases = [
      [
        'never cleared',
        connect(
          `${GUARD}        self._connection = asyncio.ensure_future(self._open())\n        return await self._connection`,
        ),
        found(12, 'Client._connection: rejection stays cached'),
      ],
      [
        'cleared without an identity check',
        connect(
          `${GUARD}        self._connection = asyncio.create_task(self._open())\n        try:\n            return await self._connection\n        except Exception:\n            self._connection = None\n            raise`,
        ),
        found(16, 'Client._connection: cleared without checking it is still this attempt'),
      ],
      [
        'functools cache on an async function',
        '@functools.lru_cache(maxsize=None)\nasync def load(key):\n    return key\n'.replace(
          /^/,
          'import functools\n\n\n',
        ),
        found(5, 'load: functools cache on an async function'),
      ],
    ];
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
  });

  it('accepts a cache cleared only while it still holds the attempt', () => {
    const cases = [
      [
        'identity checked',
        connect(
          `${GUARD}        attempt = asyncio.ensure_future(self._open())\n        self._connection = attempt\n        try:\n            return await attempt\n        except Exception:\n            if self._connection is attempt:\n                self._connection = None\n            raise`,
        ),
        [],
      ],
      [
        'a task that is never returned again',
        connect(
          '        self._connection = asyncio.ensure_future(self._open())\n        return None',
        ),
        [],
      ],
    ];
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
  });
});
