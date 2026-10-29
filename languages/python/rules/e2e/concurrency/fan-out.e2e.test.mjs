import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';
import { FAN_OUT_SEPARATOR as S } from '../../hints/ast-smells.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, findingsOf } = createScripts();
afterEach(cleanup);

const HEAD = 'import asyncio\n\nimport httpx\n\n\n';
const WORKER =
  'async def one(client: httpx.AsyncClient, url):\n    return await client.get(url, timeout=5)\n\n\n';

function only(verdicts) {
  return Object.fromEntries(
    Object.entries(verdicts).map(([name, found]) => [
      name,
      found.filter((entry) => entry.startsWith('unbounded-fan-out')),
    ]),
  );
}

function check(rows) {
  const [actual, expected] = outcomes(rows);
  return [only(actual), expected];
}

function loopsAndFanOut(verdicts) {
  return Object.fromEntries(
    Object.entries(verdicts).map(([name, found]) => [
      name,
      found.filter((entry) => /^(?:unbounded-fan-out|io-in-loop):/u.test(entry)),
    ]),
  );
}

const fan = (body, head = HEAD + WORKER) =>
  `${head}async def run(client: httpx.AsyncClient, urls):\n${body}\n`;

describe.skipIf(!enabled)('unbounded-fan-out over gather', () => {
  it('reports a remote call started for every element of a runtime collection', () => {
    const [actual, expected] = check([
      [
        'a generator through a project coroutine',
        fan('    return await asyncio.gather(*(one(client, u) for u in urls))'),
        [`unbounded-fan-out:11 asyncio.gather${S}urls${S}one()${S}client.get()${S}remote`],
      ],
      [
        'a list comprehension of direct client calls',
        fan('    return await asyncio.gather(*[client.get(u, timeout=5) for u in urls])'),
        [`unbounded-fan-out:11 asyncio.gather${S}urls${S}client.get()${S}${S}remote`],
      ],
      [
        'a comprehension bound to a name',
        fan('    tasks = [one(client, u) for u in urls]\n    return await asyncio.gather(*tasks)'),
        [`unbounded-fan-out:12 asyncio.gather${S}urls${S}one()${S}client.get()${S}remote`],
      ],
      [
        'awaitables appended in a loop',
        fan(
          '    tasks = []\n    for u in urls:\n        tasks.append(one(client, u))\n    return await asyncio.gather(*tasks)',
        ),
        [`unbounded-fan-out:14 asyncio.gather${S}urls${S}one()${S}client.get()${S}remote`],
      ],
      [
        'map over the client method',
        fan('    return await asyncio.gather(*map(client.get, urls))'),
        [`unbounded-fan-out:11 asyncio.gather${S}urls${S}client.get()${S}${S}remote`],
      ],
      [
        'asyncio.wait on a comprehension of tasks',
        fan('    return await asyncio.wait([asyncio.ensure_future(one(client, u)) for u in urls])'),
        [`unbounded-fan-out:11 asyncio.ensure_future${S}urls${S}one()${S}client.get()${S}remote`],
      ],
      [
        'a coroutine two helpers away',
        `${HEAD}async def leaf(client: httpx.AsyncClient, u):\n    return await client.post(u, timeout=5)\n\n\nasync def mid(client, u):\n    return await leaf(client, u)\n\n\nasync def run(client, urls):\n    return await asyncio.gather(*(mid(client, u) for u in urls))\n`,
        [`unbounded-fan-out:15 asyncio.gather${S}urls${S}mid()${S}client.post()${S}remote`],
      ],
      [
        'a method of the class',
        `${HEAD}class Sync:\n    def __init__(self):\n        self.http = httpx.AsyncClient()\n\n    async def one(self, u):\n        return await self.http.get(u, timeout=5)\n\n    async def all(self, urls):\n        return await asyncio.gather(*(self.one(u) for u in urls))\n`,
        [`unbounded-fan-out:14 asyncio.gather${S}urls${S}self.one()${S}self.http.get()${S}remote`],
      ],
      [
        'a renamed import',
        'import asyncio as aio\n\nimport httpx as web\n\n\nasync def run(client: web.AsyncClient, urls):\n    return await aio.gather(*(client.get(u, timeout=5) for u in urls))\n',
        [`unbounded-fan-out:7 asyncio.gather${S}urls${S}client.get()${S}${S}remote`],
      ],
      [
        'a broker publish',
        'import asyncio\n\nfrom aiokafka import AIOKafkaProducer\n\n\nasync def run(events):\n    producer = AIOKafkaProducer()\n    await asyncio.gather(*(producer.send("t", e) for e in events))\n',
        [`unbounded-fan-out:8 asyncio.gather${S}events${S}producer.send()${S}${S}message`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('unbounded-fan-out over task creation', () => {
  it('reports tasks created per element of a runtime collection', () => {
    const [actual, expected] = check([
      [
        'a task group',
        fan(
          '    async with asyncio.TaskGroup() as tg:\n        for u in urls:\n            tg.create_task(one(client, u))',
        ),
        [`unbounded-fan-out:13 tg.create_task${S}urls${S}one()${S}client.get()${S}remote`],
      ],
      [
        'create_task in a comprehension',
        fan('    return [asyncio.create_task(one(client, u)) for u in urls]'),
        [`unbounded-fan-out:11 asyncio.create_task${S}urls${S}one()${S}client.get()${S}remote`],
      ],
      [
        'a nursery',
        fan('    for u in urls:\n        client.nursery.start_soon(one, client, u)'),
        [`unbounded-fan-out:12 client.nursery.start_soon${S}urls${S}one()${S}client.get()${S}remote`],
      ],
      [
        'a task awaited at once',
        fan('    for u in urls:\n        await asyncio.create_task(one(client, u))'),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('unbounded-fan-out allowed forms', () => {
  it('accepts a limiter acquired in the task, fixed collections and chunks', () => {
    const limited = `${HEAD}LIMIT = asyncio.Semaphore(8)\n\n\nasync def one(client: httpx.AsyncClient, u):\n    async with LIMIT:\n        return await client.get(u, timeout=5)\n\n\nasync def run(client, urls):\n    return await asyncio.gather(*(one(client, u) for u in urls))\n`;
    const [actual, expected] = check([
      ['a module semaphore in the task body', limited, []],
      [
        'a semaphore created inside the task',
        `${HEAD}async def one(client: httpx.AsyncClient, u):\n    async with asyncio.Semaphore(8):\n        return await client.get(u, timeout=5)\n\n\nasync def run(client, urls):\n    return await asyncio.gather(*(one(client, u) for u in urls))\n`,
        [`unbounded-fan-out:12 asyncio.gather${S}urls${S}one()${S}client.get()${S}remote`],
      ],
      [
        'a limit constant nothing acquires',
        `${HEAD}LIMIT = 8\n\n\n${WORKER}async def run(client, urls):\n    return await asyncio.gather(*(one(client, u) for u in urls))\n`,
        [`unbounded-fan-out:14 asyncio.gather${S}urls${S}one()${S}client.get()${S}remote`],
      ],
      [
        'a semaphore passed as a parameter',
        `${HEAD}async def one(client: httpx.AsyncClient, u, gate):\n    async with gate:\n        return await client.get(u, timeout=5)\n\n\nasync def run(client, urls, gate):\n    return await asyncio.gather(*(one(client, u, gate) for u in urls))\n`,
        [],
      ],
      [
        'a literal list',
        fan('    return await asyncio.gather(*(one(client, u) for u in ["a", "b"]))'),
        [],
      ],
      [
        'a module constant list',
        `${HEAD}HOSTS = ["a", "b"]\n\n\n${WORKER}async def run(client):\n    return await asyncio.gather(*(one(client, h) for h in HOSTS))\n`,
        [],
      ],
      [
        'a slice of constant size',
        fan('    return await asyncio.gather(*(one(client, u) for u in urls[:5]))'),
        [],
      ],
      [
        'chunks of constant size',
        fan(
          '    for i in range(0, len(urls), 20):\n        chunk = urls[i : i + 20]\n        await asyncio.gather(*(one(client, u) for u in chunk))',
        ),
        [],
      ],
      [
        'chunks sized by a parameter',
        'import asyncio\n\nimport httpx\n\n\nasync def run(client: httpx.AsyncClient, urls, size):\n    for start in range(0, len(urls), size):\n        chunk = urls[start : start + size]\n        await asyncio.gather(*(client.get(u, timeout=5) for u in chunk))\n',
        [],
      ],
      [
        'a slice that is as long as the collection',
        fan(
          '    return await asyncio.gather(*(client.get(u, timeout=5) for u in urls[: len(urls)]))',
        ),
        [`unbounded-fan-out:11 asyncio.gather${S}urls[:len(urls)]${S}client.get()${S}${S}remote`],
      ],
      [
        'a chunking helper with a constant size',
        fan(
          '    for chunk in chunked(urls, 20):\n        await asyncio.gather(*(one(client, u) for u in chunk))',
        ),
        [],
      ],
      [
        'a window drained inside the loop',
        fan(
          '    pending = []\n    for u in urls:\n        pending.append(asyncio.create_task(one(client, u)))\n        if len(pending) >= 20:\n            await asyncio.gather(*pending)\n            pending = []',
        ),
        [],
      ],
      [
        'work that calls no remote service',
        `${HEAD}async def compute(v):\n    return v\n\n\nasync def run(values):\n    return await asyncio.gather(*(compute(v) for v in values))\n`,
        [],
      ],
      [
        'a client of unknown type',
        'import asyncio\n\n\nasync def run(client, urls):\n    return await asyncio.gather(*(client.get(u) for u in urls))\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('skips test files', () => {
    const code = fan('    return await asyncio.gather(*(one(client, u) for u in urls))');

    expect(
      findingsOf({ 'tests/test_a.py': code }, { testFiles: ['tests/test_a.py'] }).filter((line) =>
        line.startsWith('unbounded-fan-out'),
      ),
    ).toEqual([]);
  });
});

describe.skipIf(!enabled)('unbounded-fan-out worker pools and resolved limiters', () => {
  it('accepts count-driven pools and enums, and resolves limiters through call sites', () => {
    const pool = `${HEAD}async def worker(client: httpx.AsyncClient, queue):\n    url = await queue.get()\n    return await client.get(url, timeout=5)\n\n\n`;
    const guarded = `${HEAD}async def one(client: httpx.AsyncClient, permits, url):\n    async with permits:\n        return await client.get(url, timeout=5)\n\n\n`;
    const [actual, expected] = check([
      [
        'create_task per worker slot',
        `${pool}async def run(client, queue, workers):\n    return [asyncio.create_task(worker(client, queue)) for _ in range(workers)]\n`,
        [],
      ],
      [
        'gather per configured worker',
        `${pool}async def run(client, queue, settings):\n    return await asyncio.gather(*(worker(client, queue) for _ in range(settings.workers)))\n`,
        [],
      ],
      [
        'a range over the length of the collection',
        fan('    return await asyncio.gather(*(client.get(urls[i]) for i in range(len(urls))))'),
        [`unbounded-fan-out:11 asyncio.gather${S}urls${S}client.get()${S}${S}remote`],
      ],
      [
        'a count copied from the length',
        fan(
          '    count = len(urls)\n    return await asyncio.gather(*(client.get(urls[i]) for i in range(count)))',
        ),
        [`unbounded-fan-out:12 asyncio.gather${S}urls${S}client.get()${S}${S}remote`],
      ],
      [
        'an enum of the module',
        `import asyncio\nimport enum\n\nimport httpx\n\n\nclass Region(enum.Enum):\n    EU = "eu"\n\n\nasync def run(client: httpx.AsyncClient):\n    return await asyncio.gather(*(client.get(r.value) for r in Region))\n`,
        [],
      ],
      [
        'a collection text with the separator character of other tools',
        fan('    return await asyncio.gather(*(client.get(u) for u in urls | extra))'),
        [`unbounded-fan-out:11 asyncio.gather${S}urls | extra${S}client.get()${S}${S}remote`],
      ],
      [
        'a semaphore created by the caller and passed in',
        `${guarded}async def run(client, urls):\n    permits = asyncio.Semaphore(4)\n    return await asyncio.gather(*(one(client, permits, u) for u in urls))\n`,
        [],
      ],
      [
        'a parameter annotated as a semaphore',
        `${HEAD}async def one(client: httpx.AsyncClient, p: asyncio.Semaphore, url):\n    async with p:\n        return await client.get(url, timeout=5)\n\n\nasync def run(client, p, urls):\n    return await asyncio.gather(*(one(client, p, u) for u in urls))\n`,
        [],
      ],
      [
        'a database pool acquired around the call',
        `${HEAD}async def one(client: httpx.AsyncClient, pool, url):\n    async with pool.acquire():\n        return await client.get(url, timeout=5)\n\n\nasync def run(client, pool, urls):\n    return await asyncio.gather(*(one(client, pool, u) for u in urls))\n`,
        [`unbounded-fan-out:12 asyncio.gather${S}urls${S}one()${S}client.get()${S}remote`],
      ],
      [
        'an imported context manager that is no limiter',
        `${HEAD.replace('import httpx\n', 'import httpx\nfrom app.db import session\n')}async def one(client: httpx.AsyncClient, url):\n    async with session:\n        return await client.get(url, timeout=5)\n\n\nasync def run(client, urls):\n    return await asyncio.gather(*(one(client, u) for u in urls))\n`,
        [`unbounded-fan-out:13 asyncio.gather${S}urls${S}one()${S}client.get()${S}remote`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('io-in-loop next to unbounded-fan-out', () => {
  it('drops the loop finding only where the fan-out is reported', () => {
    const [actual, expected] = outcomes([
      [
        'a task awaited at once',
        fan('    for u in urls:\n        await asyncio.create_task(client.get(u, timeout=5))'),
        ['io-in-loop:12 client.get()'],
      ],
      [
        'tasks over fixed-size slices',
        fan(
          '    for i in range(0, len(urls), 10):\n        for u in urls[i : i + 10]:\n            asyncio.create_task(client.get(u, timeout=5))',
        ),
        ['io-in-loop:13 client.get()'],
      ],
      [
        'tasks over a literal list',
        fan('    for u in ["a", "b"]:\n        asyncio.create_task(client.get(u, timeout=5))'),
        ['io-in-loop:12 client.get()'],
      ],
      [
        'tasks that take a module semaphore',
        `${HEAD}LIMIT = asyncio.Semaphore(4)\n\n\nasync def one(client: httpx.AsyncClient, url):\n    async with LIMIT:\n        return await client.get(url, timeout=5)\n\n\nasync def run(client, urls):\n    async with asyncio.TaskGroup() as tg:\n        for u in urls:\n            tg.create_task(one(client, u))\n`,
        ['io-in-loop:17 one()'],
      ],
      [
        'an unbounded task per element',
        fan('    for u in urls:\n        asyncio.create_task(client.get(u, timeout=5))'),
        [`unbounded-fan-out:12 asyncio.create_task${S}urls${S}client.get()${S}${S}remote`],
      ],
      [
        'map over the client method',
        fan('    return await asyncio.gather(*map(client.get, urls))'),
        [`unbounded-fan-out:11 asyncio.gather${S}urls${S}client.get()${S}${S}remote`],
      ],
    ]);
    expect(loopsAndFanOut(actual)).toEqual(expected);
  });
});
