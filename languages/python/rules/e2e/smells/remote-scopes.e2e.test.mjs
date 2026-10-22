import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({
  hidden: ['test-without-assertion', 'network-in-test'],
});
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;

describe.skipIf(!enabled)('remote-call-in-transaction', () => {
  it('flags a remote call inside a transaction that also uses the database', () => {
    const [actual, expected] = outcomes([
      [
        'a Django atomic block',
        code(
          'import requests',
          'from django.db import transaction',
          '',
          '',
          'def pay(order):',
          '    with transaction.atomic():',
          '        order.save()',
          '        requests.post("https://pay.test", json={"id": order.id})',
        ),
        ['remote-call-in-transaction:8 requests.post()|transaction.atomic()'],
      ],
      [
        'a Django atomic decorator',
        code(
          'import requests',
          'from django.db import transaction',
          '',
          '',
          '@transaction.atomic',
          'def pay(order):',
          '    Order.objects.filter(id=order.id).update(paid=True)',
          '    requests.post("https://pay.test")',
        ),
        ['remote-call-in-transaction:8 requests.post()|transaction.atomic()'],
      ],
      [
        'an imported atomic decorator with arguments',
        code(
          'import requests',
          'from django.db.transaction import atomic',
          '',
          '',
          '@atomic(using="orders")',
          'def pay(order):',
          '    order.save()',
          '    requests.post("https://pay.test")',
        ),
        ['remote-call-in-transaction:8 requests.post()|atomic()'],
      ],
      [
        'a SQLAlchemy session transaction',
        code(
          'import httpx',
          '',
          '',
          'def pay(session, order):',
          '    with session.begin():',
          '        session.execute(update_statement, order)',
          '        httpx.post("https://pay.test")',
        ),
        ['remote-call-in-transaction:7 httpx.post()|session.begin()'],
      ],
      [
        'an engine transaction',
        code(
          'import requests',
          '',
          '',
          'def pay(engine, order):',
          '    with engine.begin() as connection:',
          '        connection.execute("update orders set paid = 1")',
          '        requests.get("https://pay.test")',
        ),
        ['remote-call-in-transaction:7 requests.get()|engine.begin()'],
      ],
      [
        'a nested transaction in an async function',
        code(
          'import httpx',
          '',
          '',
          'async def pay(session, order):',
          '    async with session.begin_nested():',
          '        session.add(order)',
          '        await httpx.AsyncClient().post("https://pay.test")',
        ),
        ['remote-call-in-transaction:7 httpx.AsyncClient.post()|session.begin_nested()'],
      ],
      [
        'a psycopg transaction',
        code(
          'import requests',
          '',
          '',
          'def pay(conn, order):',
          '    with conn.transaction():',
          '        conn.execute("update orders set paid = true")',
          '        requests.post("https://pay.test")',
        ),
        ['remote-call-in-transaction:7 requests.post()|conn.transaction()'],
      ],
      [
        'a remote call through a helper',
        code(
          'import requests',
          'from django.db import transaction',
          '',
          '',
          'def charge(order):',
          '    return requests.post("https://pay.test")',
          '',
          '',
          'def pay(order):',
          '    with transaction.atomic():',
          '        order.save()',
          '        charge(order)',
        ),
        ['remote-call-in-transaction:12 charge() > requests.post()|transaction.atomic()'],
      ],
      [
        'no database effect in the transaction',
        code(
          'import requests',
          'from django.db import transaction',
          '',
          '',
          'def pay(order):',
          '    with transaction.atomic():',
          '        requests.post("https://pay.test")',
        ),
        [],
      ],
      [
        'a remote call before and after the transaction',
        code(
          'import requests',
          'from django.db import transaction',
          '',
          '',
          'def pay(order):',
          '    requests.get("https://pay.test/quote")',
          '    with transaction.atomic():',
          '        order.save()',
          '    requests.post("https://pay.test")',
        ),
        [],
      ],
      [
        'a callback after the commit',
        code(
          'import requests',
          'from django.db import transaction',
          '',
          '',
          'def pay(order):',
          '    with transaction.atomic():',
          '        order.save()',
          '        transaction.on_commit(lambda: requests.post("https://pay.test"))',
        ),
        [],
      ],
      [
        'a function defined in the transaction',
        code(
          'import requests',
          'from django.db import transaction',
          '',
          '',
          'def pay(order):',
          '    with transaction.atomic():',
          '        order.save()',
          '',
          '        def later():',
          '            requests.post("https://pay.test")',
        ),
        [],
      ],
      [
        'a transaction of another library',
        code(
          'import requests',
          '',
          '',
          'def pay(tracer, order):',
          '    with tracer.begin():',
          '        order.save()',
          '        requests.post("https://pay.test")',
        ),
        [],
      ],
      [
        'a test file',
        {
          file: 'tests/test_pay.py',
          code: code(
            'import requests',
            'from django.db import transaction',
            '',
            '',
            'def test_pay(order):',
            '    with transaction.atomic():',
            '        order.save()',
            '        requests.post("https://pay.test")',
          ),
        },
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('remote-call-under-lock', () => {
  it('flags a remote call while a lock is held', () => {
    const [actual, expected] = outcomes([
      [
        'a threading lock on self',
        code(
          'import threading',
          'import requests',
          '',
          '',
          'class Cache:',
          '    def __init__(self):',
          '        self._guard = threading.Lock()',
          '',
          '    def refresh(self):',
          '        with self._guard:',
          '            return requests.get("https://config.test")',
        ),
        ['remote-call-under-lock:11 requests.get()|self._guard'],
      ],
      [
        'an asyncio lock',
        code(
          'import asyncio',
          'import httpx',
          '',
          'LOCK = asyncio.Lock()',
          '',
          '',
          'async def refresh(client: httpx.AsyncClient):',
          '    async with LOCK:',
          '        return await httpx.AsyncClient().get("https://config.test")',
        ),
        ['remote-call-under-lock:9 httpx.AsyncClient.get()|LOCK'],
      ],
      [
        'a lock by its name',
        code(
          'import requests',
          '',
          '',
          'def refresh(refresh_lock):',
          '    with refresh_lock:',
          '        requests.get("https://config.test")',
        ),
        ['remote-call-under-lock:6 requests.get()|refresh_lock'],
      ],
      [
        'a file lock',
        code(
          'import filelock',
          'import requests',
          '',
          '',
          'def refresh():',
          '    with filelock.FileLock("/tmp/x.lock"):',
          '        requests.get("https://config.test")',
        ),
        ['remote-call-under-lock:7 requests.get()|filelock.FileLock()'],
      ],
      [
        'a redis lock',
        code(
          'import redis',
          'import requests',
          '',
          'client = redis.Redis()',
          '',
          '',
          'def refresh():',
          '    with client.lock("refresh"):',
          '        requests.get("https://config.test")',
        ),
        ['remote-call-under-lock:9 requests.get()|client.lock()'],
      ],
      [
        'a remote call after the lock',
        code(
          'import threading',
          'import requests',
          '',
          'LOCK = threading.Lock()',
          '',
          '',
          'def refresh(state):',
          '    with LOCK:',
          '        url = state.url',
          '    return requests.get(url)',
        ),
        [],
      ],
      [
        'a database call under the lock',
        code(
          'import threading',
          '',
          'LOCK = threading.Lock()',
          '',
          '',
          'def refresh(repo):',
          '    with LOCK:',
          '        return repo.find_by_id(1)',
        ),
        [],
      ],
      [
        'a context manager that is no lock',
        code(
          'import requests',
          '',
          '',
          'def refresh(path):',
          '    with open(path) as handle:',
          '        requests.post("https://x.test", data=handle)',
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
