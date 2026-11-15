import { useScripts } from '../../test-support/python-rule-scripts.mts';

const { describeRules, itOutcomes } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
  hidden: ['io-in-loop', 'unbounded-collection'],
});

const RULE = 'cached-rejection';
const found = (line: number, subject: string) => [`${RULE}:${String(line)} ${subject}`];
const HEAD =
  'import asyncio\nimport functools\n\n\nclass Client:\n    def __init__(self):\n        self._connection = None\n\n';
const connect = (body: string) => `${HEAD}    async def connect(self):\n${body}\n`;
const GUARD =
  '        if self._connection is not None:\n            return await self._connection\n';

describeRules('cached-rejection', () => {
  itOutcomes('reports a cached task that keeps its rejection or is cleared blindly', [
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
  ]);

  itOutcomes('accepts a cache cleared only while it still holds the attempt', [
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
  ]);
});
