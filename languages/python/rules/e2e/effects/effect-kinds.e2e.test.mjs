import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, findingsOf } = createScripts({
  hidden: ['swallowed-exception', 'test-without-assertion'],
});
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;

describe.skipIf(!enabled)('effect kinds', () => {
  it('gives no kind to value types and exceptions of input and output libraries', () => {
    const [actual, expected] = outcomes([
      [
        'values built in a loop',
        code(
          'import httpx',
          'from requests.exceptions import HTTPError',
          'from requests.auth import HTTPBasicAuth',
          'from psycopg2.extras import Json',
          'from httpx import URL',
          '',
          '',
          'def build(rows):',
          '    out = []',
          '    for row in rows:',
          '        out.append(Json(row))',
          '        out.append(HTTPBasicAuth(row.user, row.password))',
          '        out.append(URL(row.url))',
          '        out.append(httpx.Timeout(5))',
          '        if row.bad:',
          '            raise HTTPError("bad")',
          '    return out',
        ),
        [],
      ],
      [
        'a value built under a lock',
        code(
          'import threading',
          'from httpx import URL',
          '',
          'LOCK = threading.Lock()',
          '',
          '',
          'def under_lock(url):',
          '    with LOCK:',
          '        return URL(url)',
        ),
        [],
      ],
      [
        'a function of the same libraries',
        code(
          'from psycopg2.extras import execute_values',
          'from requests import get',
          '',
          '',
          'def f(cursor, rows):',
          '    for row in rows:',
          '        execute_values(cursor, "insert into t values %s", [row])',
          '        get(row.url, timeout=5)',
        ),
        ['io-in-loop:7 execute_values()|database', 'io-in-loop:8 get()|remote'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reads an attribute or a name bound to a literal or a builtin container as no input or output', () => {
    const repository = code(
      'import requests',
      '',
      '',
      'class OrderRepo:',
      '    def get(self, key):',
      '        return requests.get("https://orders.example.com/" + key, timeout=3)',
      '',
      '    def update(self, row):',
      '        return requests.put("https://orders.example.com", json=row, timeout=3)',
    );
    const cache = code(
      'from collections import defaultdict',
      'from repo import OrderRepo',
      '',
      '',
      'class Cache:',
      '    def __init__(self):',
      '        self.store = {}',
      '        self.counts = defaultdict(int)',
      '        self.repo = OrderRepo()',
      '',
      '    def warm(self, keys):',
      '        local = dict()',
      '        for key in keys:',
      '            self.store.get(key)',
      '            self.store.update({key: 1})',
      '            self.counts.update({key: 1})',
      '            local.update({key: 1})',
      '            self.repo.get(key)',
    );

    expect(findingsOf({ 'repo.py': repository, 'cache.py': cache })).toEqual([
      'io-in-loop cache.py:18 self.repo.get() > requests.get()|remote',
    ]);
  });

  it('keeps the kind of a resolved client over the name of its receiver', () => {
    const [actual, expected] = outcomes([
      [
        'an HTTP session delete in a transaction',
        code(
          'import aiohttp',
          'from django.db import transaction',
          '',
          '',
          'async def f(url):',
          '    session = aiohttp.ClientSession()',
          '    with transaction.atomic():',
          '        await session.delete(url)',
        ),
        [],
      ],
      [
        'an HTTP session delete with a database write in a transaction',
        code(
          'import aiohttp',
          'from django.db import transaction',
          'from shop.models import Order',
          '',
          '',
          'async def f(url):',
          '    session = aiohttp.ClientSession()',
          '    with transaction.atomic():',
          '        Order.objects.create(url=url)',
          '        await session.delete(url)',
        ),
        ['remote-call-in-transaction:10 session.delete()|transaction.atomic()'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reads the commands of a pipeline or a batch writer as buffered', () => {
    const [actual, expected] = outcomes([
      [
        'buffered commands',
        code(
          'import boto3',
          'import redis',
          '',
          'r = redis.Redis()',
          'table = boto3.resource("dynamodb").Table("t")',
          '',
          '',
          'def pipe(keys):',
          '    pipe = r.pipeline()',
          '    for key in keys:',
          '        pipe.get(key)',
          '    return pipe.execute()',
          '',
          '',
          'async def pipe_block(keys):',
          '    async with r.pipeline() as p:',
          '        for key in keys:',
          '            await p.set(key, 1)',
          '        await p.execute()',
          '',
          '',
          'def batch(items):',
          '    with table.batch_writer() as writer:',
          '        for item in items:',
          '            writer.put_item(Item=item)',
        ),
        [],
      ],
      [
        'a pipeline executed per item',
        code(
          'import redis',
          '',
          'r = redis.Redis()',
          '',
          '',
          'def f(keys):',
          '    for key in keys:',
          '        pipe = r.pipeline()',
          '        pipe.get(key)',
          '        pipe.execute()',
        ),
        ['io-in-loop:10 pipe.execute()|database'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reads the async Django ORM as database calls', () => {
    const [actual, expected] = outcomes([
      [
        'async queries and model methods in a loop',
        code(
          'from shop.models import Order',
          '',
          '',
          'async def f(ids):',
          '    for i in ids:',
          '        order = await Order.objects.aget(pk=i)',
          '        await Order.objects.filter(pk=i).acount()',
          '        await order.asave()',
          '        await order.arefresh_from_db()',
        ),
        [
          'io-in-loop:6 Order.objects.aget()|database',
          'io-in-loop:7 Order.objects.filter(...).acount()|database',
          'io-in-loop:8 order.asave()|database',
          'io-in-loop:9 order.arefresh_from_db()|database',
        ],
      ],
      [
        'async writes in a transaction',
        code(
          'import requests',
          'from django.db import transaction',
          'from shop.models import Order',
          '',
          '',
          'async def f(order):',
          '    with transaction.atomic():',
          '        await order.asave()',
          '        requests.post("https://hooks.example.com", timeout=5)',
        ),
        ['remote-call-in-transaction:9 requests.post()|transaction.atomic()'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('follows a call into a nested function', () => {
    const [actual, expected] = outcomes([
      [
        'database calls of a closure gathered under a semaphore',
        code(
          'import asyncio',
          '',
          '',
          'async def f(session, model, ids):',
          '    limit = asyncio.Semaphore(5)',
          '',
          '    async def one(i):',
          '        async with limit:',
          '            return await session.get(model, i)',
          '',
          '    return await asyncio.gather(*[one(i) for i in ids])',
        ),
        ['io-in-loop:11 one() > session.get()|database|concurrent'],
      ],
      [
        'remote calls of a closure gathered under a semaphore',
        code(
          'import asyncio',
          '',
          '',
          'async def f(client, urls):',
          '    limit = asyncio.Semaphore(5)',
          '',
          '    async def one(url):',
          '        async with limit:',
          '            return await client.get(url)',
          '',
          '    return await asyncio.gather(*[one(url) for url in urls])',
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('follows a method called through an instance, the class or an annotated attribute', () => {
    const clients = code(
      'import requests',
      '',
      '',
      'class PriceClient:',
      '    def __init__(self):',
      '        self.http = requests.Session()',
      '',
      '    def price(self, sku):',
      '        return self.http.get(f"https://prices.example.com/{sku}", timeout=3).json()',
      '',
      '    @staticmethod',
      '    def static_price(sku):',
      '        return requests.get("https://prices.example.com", timeout=3)',
      '',
      '    @classmethod',
      '    def class_price(cls, sku):',
      '        return requests.get("https://prices.example.com", timeout=3)',
    );
    const orders = code(
      'from clients import PriceClient',
      '',
      '',
      'def local(skus):',
      '    client = PriceClient()',
      '    for sku in skus:',
      '        client.price(sku)',
      '        PriceClient().price(sku)',
      '        PriceClient.static_price(sku)',
      '        PriceClient.class_price(sku)',
      '',
      '',
      'class Totals:',
      '    def __init__(self, client: PriceClient):',
      '        self.client = client',
      '',
      '    def total(self, skus):',
      '        return [self.client.price(sku) for sku in skus]',
    );

    expect(findingsOf({ 'clients.py': clients, 'orders.py': orders })).toEqual([
      'io-in-loop orders.py:7 client.price() > self.http.get()|remote',
      'io-in-loop orders.py:8 PriceClient().price() > self.http.get()|remote',
      'io-in-loop orders.py:9 PriceClient.static_price() > requests.get()|remote',
      'io-in-loop orders.py:10 PriceClient.class_price() > requests.get()|remote',
      'io-in-loop orders.py:18 self.client.price() > self.http.get()|remote',
    ]);
  });

  it('survives partials that wrap each other', () => {
    const [actual, expected] = outcomes([
      [
        'a cycle of partials',
        code(
          'from functools import partial',
          '',
          'first = partial(second)',
          'second = partial(first)',
          '',
          '',
          'def f(items):',
          '    for item in items:',
          '        first(item)',
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('names the shortest helper path, and the first by name among equals', () => {
    const [actual, expected] = outcomes([
      [
        'a helper with two remote calls',
        code(
          'import requests',
          '',
          '',
          'def deep():',
          '    return requests.get("https://a.example.com", timeout=3)',
          '',
          '',
          'def sync(item):',
          '    deep()',
          '    requests.put("https://b.example.com", json=item, timeout=3)',
          '    requests.post("https://b.example.com", json=item, timeout=3)',
          '',
          '',
          'def f(items):',
          '    for item in items:',
          '        sync(item)',
        ),
        ['io-in-loop:16 sync() > requests.post()|remote'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
