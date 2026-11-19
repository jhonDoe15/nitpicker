import { useRuleScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const RULE = 'blocking-helper-in-async';

const { itOutcomes, describeRules } = useRuleScripts(RULE, {
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules('blocking-helper-in-async', () => {
  itOutcomes('reports a plain helper that blocks, called from an async function', [
    [
      'a helper calling requests, a nested helper, a method and an alias',
      'import time\nimport requests as http\n\n\ndef fetch(url):\n    return http.get(url, timeout=5).json()\n\n\ndef twice(url):\n    fetch(url)\n    return fetch(url)\n\n\ndef pause():\n    time.sleep(1)\n\n\nclass Client:\n    def load(self, url):\n        return http.post(url, timeout=5)\n\n    async def run(self, url):\n        self.load(url)\n\n\nasync def handler(url):\n    twice(url)\n    pause()\n',
      [
        `${RULE}:23 load calls requests.post`,
        `${RULE}:27 twice calls requests.get`,
        `${RULE}:28 pause calls time.sleep`,
      ],
    ],
    [
      'the last definition, a base class method, cls and ClassName calls, one finding per line and helper',
      'import requests\nimport time\n\n\ndef f():\n    time.sleep(1)\n\n\ndef f():\n    requests.get("x", timeout=5)\n\n\nclass Base:\n    def load(self):\n        requests.get("x", timeout=5)\n\n    @classmethod\n    def make(cls):\n        requests.get("x", timeout=5)\n\n\nclass Child(Base):\n    async def run(self):\n        self.load()\n        Base.make()\n        f(), f()\n',
      [
        `${RULE}:24 load calls requests.get`,
        `${RULE}:25 make calls requests.get`,
        `${RULE}:26 f calls requests.get`,
      ],
    ],
    [
      'four helper levels are one too many',
      'import time\n\n\ndef a():\n    time.sleep(1)\n\n\ndef b():\n    a()\n\n\ndef c():\n    b()\n\n\ndef d():\n    c()\n\n\nasync def run():\n    c()\n    d()\n',
      [`${RULE}:21 c calls time.sleep`],
    ],
    [
      'a helper imported from another module',
      {
        files: {
          'helpers.py':
            'import subprocess\n\n\ndef run(args):\n    return subprocess.run(args, timeout=5, check=True)\n',
          'mod.py':
            'from k3.helpers import run\n\n\nasync def build(args):\n    return run(args)\n',
        },
      },
      [`${RULE}:5 run calls subprocess.run`],
    ],
  ]);

  itOutcomes('passes offloaded helpers, async helpers, direct calls and non-blocking helpers', [
    [
      'to_thread, run_in_executor, a lambda, an async helper and a decorated helper',
      'import asyncio\nimport functools\nimport requests\n\n\ndef fetch(url):\n    return requests.get(url, timeout=5).json()\n\n\nasync def afetch(client, url):\n    return await client.get(url)\n\n\n@functools.cache\ndef cached(url):\n    return requests.get(url, timeout=5)\n\n\ndef parse(text):\n    return text.split()\n\n\nasync def handler(url, client):\n    loop = asyncio.get_running_loop()\n    await asyncio.to_thread(fetch, url)\n    await loop.run_in_executor(None, fetch, url)\n    await loop.run_in_executor(None, lambda: fetch(url))\n    await afetch(client, url)\n    cached(url)\n    return parse(url)\n',
      [],
    ],
    [
      'a shadowed helper, a rebound API name, a generator helper, sleep(0) and an unfollowed init',
      'import requests\nimport time\n\n\ndef f():\n    requests.get("x", timeout=5)\n\n\ndef g(requests):\n    requests.get("x")\n\n\ndef h(client):\n    requests = client\n    requests.get("x")\n\n\ndef gen():\n    requests.get("x", timeout=5)\n    yield 1\n\n\ndef zero():\n    time.sleep(0)\n\n\nclass A:\n    def __init__(self):\n        requests.get("x", timeout=5)\n\n\nasync def a(f, client):\n    f()\n    g(client)\n    h(client)\n    gen()\n    zero()\n    A()\n    k = lambda: 1\n    k()\n\n    def f2():\n        return 1\n\n    f2()\n',
      [],
    ],
    [
      'a sync function that is not called from async code',
      'import requests\n\n\ndef fetch(url):\n    return requests.get(url, timeout=5)\n\n\ndef main(url):\n    return fetch(url)\n',
      [],
    ],
  ]);

  const MODELS = [
    'from django.db import models',
    '',
    '',
    'class Order(models.Model):',
    '    total = models.IntegerField()',
    '',
    '',
  ];

  itOutcomes('reports ORM, TLS, file, lock and framework calls', [
    [
      'ORM terminals made directly and through a helper',
      code(
        ...MODELS,
        'def credits(team_id):',
        '    return Order.objects.filter(team=team_id).count()',
        '',
        '',
        'async def usage(team_id):',
        '    first = Order.objects.first()',
        '    created = Order.objects.create(total=1)',
        '    Order.objects.filter(total=2).delete()',
        '    return credits(team_id), first, created',
      ),
      [
        `${RULE}:13 Order.objects.first`,
        `${RULE}:14 Order.objects.create`,
        `${RULE}:15 Order.objects.delete`,
        `${RULE}:16 credits calls Order.objects.count`,
      ],
    ],
    [
      'iteration of a queryset',
      code(
        ...MODELS,
        'async def usage():',
        '    rows = [row for row in Order.objects.all()]',
        '    for row in Order.objects.filter(total=1):',
        '        rows.append(row)',
        '    return list(Order.objects.all()), rows',
      ),
      [
        `${RULE}:9 Order.objects.iterate`,
        `${RULE}:10 Order.objects.iterate`,
        `${RULE}:12 Order.objects.iterate`,
      ],
    ],
    [
      'a TLS context that reads certificate files',
      code(
        'import ssl',
        '',
        '',
        'def context(path):',
        '    return ssl.create_default_context(cafile=path)',
        '',
        '',
        'async def connect(path):',
        '    ctx = ssl.create_default_context(cafile=path)',
        '    ctx.load_cert_chain(path)',
        '    return context(path), ctx',
      ),
      [
        `${RULE}:9 ssl.create_default_context`,
        `${RULE}:10 load_cert_chain`,
        `${RULE}:11 context calls ssl.create_default_context`,
      ],
    ],
    [
      'a file read through a helper, and a Path read directly',
      code(
        'from pathlib import Path',
        '',
        '',
        'def load(name):',
        '    with open(name, encoding="utf-8") as handle:',
        '        return handle.read()',
        '',
        '',
        'async def schema(name):',
        '    text = Path(name).read_text()',
        '    return load(name), text',
      ),
      [`${RULE}:10 read_text`, `${RULE}:11 load calls open`],
    ],
    [
      'get_event_loop in a coroutine',
      code(
        'import asyncio',
        '',
        '',
        'async def run(work):',
        '    loop = asyncio.get_event_loop()',
        '    return await loop.run_in_executor(None, work)',
      ),
      [`${RULE}:5 asyncio.get_event_loop`],
    ],
    [
      'a thread lock and a file lock',
      code(
        'import threading',
        'import filelock',
        '',
        'LOCK = threading.Lock()',
        '',
        '',
        'def read():',
        '    with filelock.FileLock("a.lock"):',
        '        return 1',
        '',
        '',
        'async def run():',
        '    LOCK.acquire()',
        '    with LOCK:',
        '        pass',
        '    return read()',
      ),
      [
        `${RULE}:13 LOCK.acquire`,
        `${RULE}:14 LOCK.acquire`,
        `${RULE}:16 read calls filelock.FileLock.acquire`,
      ],
    ],
    [
      'the synchronous connection getter of an Airflow hook',
      code(
        'from airflow.hooks.base import BaseHook',
        '',
        '',
        'class Hook(BaseHook):',
        '    async def connect(self, conn_id):',
        '        return self.get_connection(conn_id)',
      ),
      [`${RULE}:6 self.get_connection`],
    ],
  ]);

  itOutcomes('passes offloaded and asynchronous forms of the same work', [
    [
      'async ORM methods, sync_to_async and an executor',
      code(
        'import asyncio',
        'from asgiref.sync import sync_to_async',
        ...MODELS,
        'def credits(team_id):',
        '    return Order.objects.filter(team=team_id).count()',
        '',
        '',
        'async def usage(team_id):',
        '    first = await Order.objects.aget(pk=1)',
        '    total = await Order.objects.acount()',
        '    async for row in Order.objects.all():',
        '        first = row',
        '    value = await sync_to_async(credits)(team_id)',
        '    other = await sync_to_async(lambda: Order.objects.first())()',
        '    loop = asyncio.get_running_loop()',
        '    return first, total, value, other, loop',
      ),
      [],
    ],
    [
      'a model-like name that is not a Django model, and a plain manager call',
      code(
        'class Order:',
        '    objects = []',
        '',
        '',
        'async def usage(cache):',
        '    Order.objects.first()',
        '    return cache.objects.count()',
      ),
      [],
    ],
    [
      'a default TLS context, a file open in a coroutine and a lock in sync code',
      code(
        'import ssl',
        'import threading',
        '',
        'LOCK = threading.Lock()',
        '',
        '',
        'def guarded():',
        '    with LOCK:',
        '        return 1',
        '',
        '',
        'async def run(path):',
        '    ctx = ssl.create_default_context()',
        '    with open(path) as handle:',
        '        handle.read()',
        '    return ctx',
        '',
        '',
        'def main():',
        '    return guarded()',
      ),
      [],
    ],
    [
      'a file read and a getter in a helper offloaded to a thread',
      code(
        'import asyncio',
        'from pathlib import Path',
        '',
        '',
        'def load(name):',
        '    return Path(name).read_text()',
        '',
        '',
        'async def run(name):',
        '    return await asyncio.to_thread(load, name)',
      ),
      [],
    ],
    [
      'an async comprehension over a queryset',
      code(
        ...MODELS,
        'async def usage():',
        '    return [row async for row in Order.objects.all()]',
      ),
      [],
    ],
    [
      'awaited file reads of async path libraries',
      code(
        'import anyio',
        'from pathlib import Path',
        '',
        '',
        'async def read(name):',
        '    first = await anyio.Path(name).read_text()',
        '    second = await (anyio.Path(name) / "a").read_bytes()',
        '    return first, second',
      ),
      [],
    ],
    [
      'non-blocking and bounded lock acquires',
      code(
        'import threading',
        '',
        'LOCK = threading.Lock()',
        '',
        '',
        'async def run():',
        '    LOCK.acquire(blocking=False)',
        '    LOCK.acquire(False)',
        '    LOCK.acquire(timeout=1)',
      ),
      [],
    ],
    [
      'a getter on an object when no framework is imported',
      code('async def run(client):', '    return client.get_connection("x")'),
      [],
    ],
  ]);

  itOutcomes(
    'reports the configured getters and no other name',
    [
      [
        'a method name, a dotted name and an unconfigured name',
        code(
          'async def run(client, hook):',
          '    client.fetch_secret("a")',
          '    hook.read_token("b")',
          '    return client.get_secret("c")',
        ),
        [`${RULE}:2 client.fetch_secret`, `${RULE}:3 hook.read_token`],
      ],
    ],
    { blockingGetters: ['fetch_secret', 'hook.read_token'] },
  );
});
