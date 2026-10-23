import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, findingsOf } = createScripts();
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;
const inFile = (file, source) => ({ file, code: source });

describe.skipIf(!enabled)('io-in-loop', () => {
  const loop = (call, head = 'import requests\n') =>
    `${head}\n\ndef f(items):\n    for item in items:\n        ${call}\n`;

  it('flags a database or remote call once per item', () => {
    const [actual, expected] = outcomes([
      ['requests.get', loop('requests.get(item)'), ['io-in-loop:6 requests.get()|remote']],
      [
        'a repository',
        loop('repo.find_by_id(item)', ''),
        ['io-in-loop:5 repo.find_by_id()|database'],
      ],
      [
        'a session execute',
        loop('session.execute(statement, item)', ''),
        ['io-in-loop:5 session.execute()|database'],
      ],
      [
        'a comprehension',
        'import requests\n\n\ndef f(items):\n    return [requests.get(i) for i in items]\n',
        ['io-in-loop:5 requests.get()|remote'],
      ],
      [
        'a while loop',
        'import requests\n\n\ndef f(items):\n    while items:\n        requests.get(items.pop())\n',
        ['io-in-loop:6 requests.get()|remote'],
      ],
      [
        'the iterable of the first loop',
        'import requests\n\n\ndef f(url):\n    for item in requests.get(url).json():\n        print(item)\n',
        [],
      ],
      [
        'a call outside a loop',
        'import requests\n\n\ndef f(url):\n    return requests.get(url)\n',
        [],
      ],
      [
        'a call in a function defined in the loop',
        'import requests\n\n\ndef f(items):\n    for item in items:\n        def g():\n            return requests.get(item)\n',
        [],
      ],
      [
        'a retry loop',
        'import requests\n\n\ndef f(url):\n    for attempt in range(3):\n        try:\n            return requests.get(url)\n        except OSError as error:\n            last = error\n    raise last\n',
        [],
      ],
      [
        'a paging loop',
        'def f(repo):\n    cursor = ""\n    while cursor is not None:\n        page = repo.find_page(cursor)\n        cursor = page.next\n',
        [],
      ],
      ['a test file', inFile('tests/test_a.py', loop('repo.find_by_id(item)', '')), []],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reports a database call inside a concurrent combinator and leaves a remote call to the fan-out rule', () => {
    const [actual, expected] = outcomes([
      [
        'a database call in gather over a comprehension',
        code(
          'import asyncio',
          '',
          '',
          'async def f(ids, repo):',
          '    return await asyncio.gather(*[repo.find_by_id(i) for i in ids])',
        ),
        ['io-in-loop:5 repo.find_by_id()|database|concurrent'],
      ],
      [
        'a database call in gather over a generator',
        code(
          'import asyncio',
          '',
          '',
          'async def f(ids, session):',
          '    return await asyncio.gather(*(session.execute(q, i) for i in ids))',
        ),
        ['io-in-loop:5 session.execute()|database|concurrent'],
      ],
      [
        'a database call in a task group',
        code(
          'import asyncio',
          '',
          '',
          'async def f(ids, repo):',
          '    async with asyncio.TaskGroup() as group:',
          '        for i in ids:',
          '            group.create_task(repo.find_by_id(i))',
        ),
        ['io-in-loop:7 repo.find_by_id()|database|concurrent'],
      ],
      [
        'database calls collected and gathered later',
        code(
          'import asyncio',
          '',
          '',
          'async def f(ids, repo):',
          '    tasks = []',
          '    for i in ids:',
          '        tasks.append(repo.find_by_id(i))',
          '    return await asyncio.gather(*tasks)',
        ),
        ['io-in-loop:7 repo.find_by_id()|database|concurrent'],
      ],
      [
        'a remote call in gather over a comprehension',
        code(
          'import asyncio',
          '',
          '',
          'async def f(items, client):',
          '    return await asyncio.gather(*[client.fetch(i) for i in items])',
        ),
        [],
      ],
      [
        'a remote call in a task group',
        code(
          'import asyncio',
          'import httpx',
          '',
          '',
          'async def f(urls):',
          '    async with httpx.AsyncClient() as client, asyncio.TaskGroup() as group:',
          '        for url in urls:',
          '            group.create_task(client.get(url))',
        ),
        [],
      ],
      [
        'remote calls collected and gathered later',
        code(
          'import asyncio',
          'import httpx',
          '',
          '',
          'async def f(urls, client: httpx.AsyncClient):',
          '    tasks = [client.get(url) for url in urls]',
          '    return await asyncio.gather(*tasks)',
        ),
        [],
      ],
      [
        'remote calls mapped into gather',
        code(
          'import asyncio',
          'import requests',
          '',
          '',
          'async def f(urls):',
          '    return await asyncio.gather(*map(requests.get, urls))',
        ),
        [],
      ],
      [
        'remote calls awaited one after another in a loop',
        code(
          'import asyncio',
          'import httpx',
          '',
          '',
          'async def f(urls):',
          '    async with httpx.AsyncClient() as client:',
          '        for url in urls:',
          '            await client.get(url)',
        ),
        ['io-in-loop:8 client.get()|remote'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('does not report a message publish per item', () => {
    const [actual, expected] = outcomes([
      [
        'a kafka producer',
        code(
          'from kafka import KafkaProducer',
          '',
          '',
          'def f(items):',
          '    client = KafkaProducer(bootstrap_servers="b")',
          '    for item in items:',
          '        client.send("orders", item)',
        ),
        [],
      ],
      [
        'a confluent producer on self',
        code(
          'from confluent_kafka import Producer',
          '',
          '',
          'class Publisher:',
          '    def __init__(self):',
          '        self.client = Producer({})',
          '',
          '    def publish(self, items):',
          '        for item in items:',
          '            self.client.produce("orders", item)',
        ),
        [],
      ],
      [
        'a pika channel',
        code(
          'import pika',
          '',
          '',
          'def f(channel, items):',
          '    for item in items:',
          '        channel.basic_publish(exchange="", routing_key="q", body=item)',
        ),
        [],
      ],
      [
        'an sqs client',
        code(
          'import boto3',
          '',
          '',
          'def f(items):',
          '    client = boto3.client("sqs")',
          '    for item in items:',
          '        client.send_message(QueueUrl="u", MessageBody=item)',
        ),
        [],
      ],
      [
        'an sns client',
        code(
          'import boto3',
          '',
          '',
          'def f(items):',
          '    client = boto3.client("sns")',
          '    for item in items:',
          '        client.publish(TopicArn="t", Message=item)',
        ),
        [],
      ],
      [
        'a pub/sub publisher',
        code(
          'from google.cloud import pubsub_v1',
          '',
          '',
          'def f(items):',
          '    client = pubsub_v1.PublisherClient()',
          '    for item in items:',
          '        client.publish("topic", item)',
        ),
        [],
      ],
      [
        'a nats connection',
        code(
          'import nats',
          '',
          '',
          'async def f(nc, items):',
          '    for item in items:',
          '        await nc.publish("orders", item)',
        ),
        [],
      ],
      [
        'a celery task',
        code(
          'from celery import shared_task',
          '',
          '',
          '@shared_task',
          'def notify(order_id):',
          '    return order_id',
          '',
          '',
          'def f(ids):',
          '    for i in ids:',
          '        notify.delay(i)',
          '        notify.apply_async(args=[i])',
        ),
        [],
      ],
      [
        'a helper that only publishes',
        code(
          'import pika',
          '',
          '',
          'def announce(channel, item):',
          '    channel.basic_publish(exchange="", routing_key="q", body=item)',
          '',
          '',
          'def f(channel, items):',
          '    for item in items:',
          '        announce(channel, item)',
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('io-in-loop through wrappers', () => {
  it('follows project helpers, methods, sessions, partials and map and names the path', () => {
    const files = {
      'src/shop/orders.py':
        'import requests\n\n\ndef fetch_order(ident):\n    return requests.get(f"https://x/{ident}", timeout=5)\n',
      'src/shop/loops.py':
        'import functools\nimport requests\n\nfrom shop.orders import fetch_order\n\nget = functools.partial(requests.get, timeout=5)\n\n\nclass Store:\n    def load(self, ident):\n        return requests.get(ident, timeout=5)\n\n\nclass Sync:\n    def __init__(self, store):\n        self._store = store\n\n    def via_attribute(self, ids):\n        return [self._store.load(i) for i in ids]\n\n    def via_method(self, ids):\n        return [self.load_one(i) for i in ids]\n\n    def load_one(self, ident):\n        return self._store.load(ident)\n\n\ndef via_helper(ids):\n    return [fetch_order(i) for i in ids]\n\n\ndef via_partial(urls):\n    return [get(u) for u in urls]\n\n\ndef via_map(urls):\n    return list(map(requests.get, urls))\n\n\ndef via_session(urls):\n    with requests.Session() as s:\n        return [s.get(u, timeout=5) for u in urls]\n',
    };

    expect(findingsOf(files, { sourceRoots: ['src'] })).toEqual([
      'io-in-loop src/shop/loops.py:19 self._store.load() > requests.get()|remote',
      'io-in-loop src/shop/loops.py:22 self.load_one() > self._store.load() > requests.get()|remote',
      'io-in-loop src/shop/loops.py:29 fetch_order() > requests.get()|remote',
      'io-in-loop src/shop/loops.py:33 get() > requests.get()|remote',
      'io-in-loop src/shop/loops.py:37 requests.get()|remote',
      'io-in-loop src/shop/loops.py:42 s.get()|remote',
    ]);
  });

  it('judges a helper by the kinds of the calls in its body', () => {
    const files = {
      'src/shop/store.py': code(
        'import requests',
        'import sqlite3',
        '',
        '',
        'def load_row(conn, ident):',
        '    return conn.execute("select 1 where id = ?", (ident,))',
        '',
        '',
        'def load_remote(url):',
        '    return requests.get(url, timeout=5)',
        '',
        '',
        'def load_both(conn, ident):',
        '    load_remote(ident)',
        '    return load_row(conn, ident)',
        '',
        '',
        'def pure(ident):',
        '    return ident + 1',
      ),
      'src/shop/jobs.py': code(
        'import asyncio',
        '',
        'from shop.store import load_both, load_remote, load_row, pure',
        '',
        '',
        'def rows(conn, ids):',
        '    return [load_row(conn, i) for i in ids]',
        '',
        '',
        'def both(conn, ids):',
        '    return [load_both(conn, i) for i in ids]',
        '',
        '',
        'def computed(ids):',
        '    return [pure(i) for i in ids]',
        '',
        '',
        'async def concurrent_rows(conn, ids):',
        '    return await asyncio.gather(*[load_row(conn, i) for i in ids])',
        '',
        '',
        'async def concurrent_remote(urls):',
        '    return await asyncio.gather(*[load_remote(u) for u in urls])',
      ),
    };

    expect(findingsOf(files, { sourceRoots: ['src'] })).toEqual([
      'io-in-loop src/shop/jobs.py:7 load_row() > conn.execute()|database',
      'io-in-loop src/shop/jobs.py:11 load_both() > load_row() > conn.execute()|database',
      'io-in-loop src/shop/jobs.py:19 load_row() > conn.execute()|database|concurrent',
    ]);
  });

  it('counts paging only when the tested name comes from the input and output call', () => {
    const [actual, expected] = outcomes([
      [
        'a loop that shrinks a list',
        'import requests\n\n\ndef f(ids):\n    remaining = ids\n    while remaining:\n        requests.post("https://x", json=remaining[0])\n        remaining = remaining[1:]\n',
        ['io-in-loop:7 requests.post()|remote'],
      ],
      [
        'a cursor read from the response',
        'import requests\n\n\ndef f(url):\n    cursor = None\n    while True:\n        page = requests.get(url, params={"c": cursor})\n        cursor = page.json()["next"]\n        if not cursor:\n            break\n',
        [],
      ],
      [
        'distinct statements',
        'def migrate(cursor, statements):\n    for statement in statements:\n        cursor.execute(statement)\n',
        [],
      ],
      [
        'a statement with parameters for each item',
        'def load(cursor, ids):\n    for ident in ids:\n        cursor.execute("select 1 where id = ?", (ident,))\n',
        ['io-in-loop:3 cursor.execute()|database'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
