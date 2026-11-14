import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({
  hidden: ['swallowed-exception', 'retry-without-idempotency'],
});
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;

describe.skipIf(!enabled)('effect kinds of value helpers and derived handles', () => {
  it('reads value helpers, session helpers, conflicting clients and derived handles', () => {
    const [actual, expected] = outcomes([
      [
        'value helpers of the HTTP libraries',
        code(
          'import http.client',
          'import urllib.request',
          'from urllib.request import urlparse',
          '',
          'import httpx',
          'import requests',
          '',
          '',
          'def f(items):',
          '    for item in items:',
          '        requests.utils.quote(item)',
          "        requests.compat.urljoin('a', item)",
          '        httpx.codes.is_error(item)',
          '        urlparse(item)',
          '        urllib.request.urlparse(item)',
          '        http.client.parse_headers(item)',
          "        requests.Request('GET', item).prepare()",
        ),
        [],
      ],
      [
        'session helpers that send nothing',
        code(
          'import requests',
          '',
          '',
          'def f(items):',
          '    session = requests.Session()',
          '    for item in items:',
          '        session.close()',
          "        session.mount('https://', item)",
          '        session.headers.update(item)',
        ),
        [],
      ],
      [
        'a client rebound to another client in the same scope',
        code(
          'import httpx',
          'from celery import Celery',
          '',
          '',
          'def f(items):',
          '    d = httpx.Client()',
          '    d = Celery()',
          '    for item in items:',
          '        d.get(item)',
        ),
        [],
      ],
      [
        'a client name bound to different clients in different functions',
        code(
          'import httpx',
          'from celery import Celery',
          '',
          'c = httpx.Client()',
          '',
          '',
          'def remote(items):',
          '    for item in items:',
          '        c.get(item, timeout=3)',
          '',
          '',
          'def message(items):',
          '    c = Celery()',
          '    for item in items:',
          '        c.send_task(item)',
        ),
        ['io-in-loop:9 c.get()|remote'],
      ],
      [
        'a requests session named client',
        code(
          'import requests',
          '',
          '',
          'def f(urls):',
          '    client = requests.Session()',
          '    for url in urls:',
          '        client.get(url, timeout=3)',
        ),
        ['io-in-loop:7 client.get()|remote'],
      ],
      [
        'collections derived from a Mongo or DynamoDB client',
        code(
          'import boto3',
          'from pymongo import MongoClient',
          '',
          '',
          'def f(ids):',
          "    mongo = MongoClient()['shop']['orders']",
          '    shop = MongoClient().shop',
          "    table = boto3.resource('dynamodb').Table('t')",
          '    orders = shop.orders',
          '    for i in ids:',
          '        mongo.find_one(i)',
          '        orders.find_one(i)',
          '        table.get_item(Key=i)',
        ),
        [
          'io-in-loop:11 mongo.find_one()|database',
          'io-in-loop:12 orders.find_one()|database',
          'io-in-loop:13 table.get_item()|database',
        ],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
