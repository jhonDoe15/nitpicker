import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes: allOutcomes } = createScripts();
afterEach(cleanup);

const RULE = 'future-without-exception';

function outcomes(rows) {
  const [actual, expected] = allOutcomes(rows);
  const own = Object.fromEntries(
    Object.entries(actual).map(([name, found]) => [name, found.filter((f) => f.startsWith(RULE))]),
  );
  return [own, expected];
}

describe.skipIf(!enabled)('future-without-exception', () => {
  it('reports a future that only a callback completes, and only with a result', () => {
    const [actual, expected] = outcomes([
      [
        'set_result passed as the callback',
        'import asyncio\n\n\ndef wait_reply(register):\n    reply = asyncio.get_running_loop().create_future()\n    register(reply.set_result)\n    return reply\n',
        [`${RULE}:5 reply`],
      ],
      [
        'set_result called inside a nested callback, an asyncio.Future and an annotated future',
        'import asyncio\nfrom concurrent.futures import Future\n\n\nasync def read(client):\n    done: asyncio.Future[bytes] = asyncio.Future()\n\n    def on_data(data):\n        done.set_result(data)\n\n    client.subscribe(on_data)\n    return await done\n\n\ndef start(pool):\n    ready = Future()\n    pool.on_ready(lambda: ready.set_result(True))\n    return ready\n',
        [`${RULE}:6 done`, `${RULE}:16 ready`],
      ],
      [
        'a call_soon_threadsafe of set_result',
        'import asyncio\n\n\nasync def fetch(loop, worker):\n    result = loop.create_future()\n    worker.run(lambda value: loop.call_soon_threadsafe(result.set_result, value))\n    return await asyncio.wait_for(result, 5)\n',
        [`${RULE}:5 result`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes a future with a failure path, or one handed on', () => {
    const [actual, expected] = outcomes([
      [
        'set_exception next to set_result, and cancel',
        'import asyncio\n\n\ndef wait_reply(register):\n    reply = asyncio.get_running_loop().create_future()\n    register(reply.set_result, reply.set_exception)\n    return reply\n\n\ndef wait_close(client):\n    closed = asyncio.get_running_loop().create_future()\n    client.on_close(lambda: closed.set_result(None))\n    client.on_drop(closed.cancel)\n    return closed\n',
        [],
      ],
      [
        'a callback that catches and sets the exception',
        'import asyncio\n\n\nasync def read(client):\n    done = asyncio.get_running_loop().create_future()\n\n    def on_data(data):\n        try:\n            done.set_result(parse(data))\n        except ValueError as error:\n            done.set_exception(error)\n\n    client.subscribe(on_data)\n    return await done\n',
        [],
      ],
      [
        'a future stored where another owner can fail it, passed on, or set directly',
        'import asyncio\n\n\nclass Calls:\n    def call(self, key, register):\n        reply = asyncio.get_running_loop().create_future()\n        self.pending[key] = reply\n        register(reply.set_result)\n        return reply\n\n\ndef track(registry, register):\n    reply = asyncio.get_running_loop().create_future()\n    registry.track(reply)\n    register(reply.set_result)\n    return reply\n\n\nasync def now(value):\n    ready = asyncio.get_running_loop().create_future()\n    ready.set_result(value)\n    return await ready\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
