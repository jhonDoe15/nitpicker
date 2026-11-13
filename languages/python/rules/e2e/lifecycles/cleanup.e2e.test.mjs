import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({ hidden: ['io-in-loop', 'unbounded-collection'] });
afterEach(cleanup);

const RULE = 'cleanup-skipped-on-failure';
const found = (line, subject) => [`${RULE}:${String(line)} ${subject}`];
const method = (name, body) =>
  `class Client:\n    async def ${name}(self):\n${body
    .split('\n')
    .map((line) => `        ${line}`)
    .join('\n')}\n`;

describe.skipIf(!enabled)('cleanup-skipped-on-failure', () => {
  it('reports a release that later steps depend on', () => {
    const cases = [
      [
        'two awaited releases',
        method('aclose', 'await self.a.aclose()\nawait self.b.aclose()'),
        found(3, 'aclose: self.a.aclose() before self.b.aclose()'),
      ],
      [
        'release then state reset',
        method('close', 'await self.a.close()\nself.client = None'),
        found(3, 'close: self.a.close() before self.client'),
      ],
      [
        'release then clear',
        method('stop', 'await self.a.stop()\nself.items.clear()'),
        found(3, 'stop: self.a.stop() before self.items.clear()'),
      ],
      [
        'inside finally',
        method('close', 'try:\n    work()\nfinally:\n    self.a.close()\n    self.b.close()'),
        found(6, 'close: self.a.close() before self.b.close()'),
      ],
      [
        'gather without return_exceptions',
        method('shutdown', 'await asyncio.gather(self.a.aclose(), self.b.aclose())'),
        found(3, 'shutdown: gather over releases'),
      ],
      [
        'gather over a generator',
        method('shutdown', 'await asyncio.gather(*(c.aclose() for c in self.clients))'),
        found(3, 'shutdown: gather over releases'),
      ],
      [
        'unittest teardown',
        `class T:\n    def tearDown(self):\n        self.server.stop()\n        self.db.close()\n`,
        found(3, 'tearDown: self.server.stop() before self.db.close()'),
      ],
      [
        'async exit',
        'class T:\n    async def __aexit__(self, *exc):\n        await self.a.aclose()\n        await self.b.aclose()\n',
        found(3, '__aexit__: self.a.aclose() before self.b.aclose()'),
      ],
    ];
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
  });

  it('accepts exit stacks, finally, tolerant gathers and other functions', () => {
    const cases = [
      [
        'exit stack',
        method(
          'aclose',
          'async with AsyncExitStack() as stack:\n    stack.push_async_callback(self.a.aclose)\n    stack.push_async_callback(self.b.aclose)',
        ),
        [],
      ],
      [
        'finally resets',
        method('close', 'try:\n    self.a.close()\nfinally:\n    self.client = None'),
        [],
      ],
      [
        'each release guarded',
        method('close', 'try:\n    self.a.close()\nexcept OSError:\n    log()\nself.b.close()'),
        [],
      ],
      [
        'tolerant gather',
        method(
          'shutdown',
          'await asyncio.gather(self.a.aclose(), self.b.aclose(), return_exceptions=True)',
        ),
        [],
      ],
      [
        'close then wait_closed',
        method('close', 'self.writer.close()\nawait self.writer.wait_closed()'),
        [],
      ],
      [
        'shutdown then close on one object',
        method('close', 'self.sock.shutdown(2)\nself.sock.close()'),
        [],
      ],
      [
        'release then reset of the same object',
        method('close', 'self.pool.shutdown()\nself.pool = None'),
        [],
      ],
      ['single release', method('close', 'await self.a.close()'), []],
      ['other function', method('start', 'await self.a.close()\nawait self.b.close()'), []],
      [
        'release then unrelated work',
        method('close', 'await self.a.close()\nself.log.info("closed")'),
        [],
      ],
    ];
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
  });

  it('reads fixture teardown after the yield', () => {
    const cases = [
      [
        'fixture',
        'import pytest\n\n\n@pytest.fixture\nasync def client(a, b):\n    yield a\n    await a.aclose()\n    await b.aclose()\n',
        found(7, 'client: a.aclose() before b.aclose()'),
      ],
      [
        'fixture before the yield',
        'import pytest\n\n\n@pytest.fixture\ndef client(a, b):\n    a.close()\n    b.close()\n    yield a\n',
        [],
      ],
    ];
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
  });
});
