import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({
  hidden: ['swallowed-exception', 'retry-without-idempotency'],
});
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;
const HEAD = ['import itertools', '', 'import requests', 'from shop.models import Order', '', ''];

describe.skipIf(!enabled)('io-in-loop over chunks, retries and mapped callables', () => {
  it('stays quiet for a loop that sends one call per chunk', () => {
    const [actual, expected] = outcomes([
      [
        'a range stepping over a list with a slice in the call',
        code(
          ...HEAD,
          'def f(ids):',
          '    for i in range(0, len(ids), 500):',
          '        Order.objects.filter(id__in=ids[i : i + 500]).delete()',
        ),
        [],
      ],
      [
        'itertools.batched passed whole',
        code(
          ...HEAD,
          'def f(items):',
          '    for batch in itertools.batched(items, 100):',
          '        requests.post("https://bulk.example.com", json=list(batch), timeout=3)',
        ),
        [],
      ],
      [
        'a more_itertools chunk passed to a batch method',
        code(
          'import more_itertools',
          '',
          '',
          'def f(cursor, rows):',
          '    for part in more_itertools.chunked(rows, 500):',
          '        cursor.executemany("insert into t values (%s)", part)',
        ),
        [],
      ],
      [
        'a list of slices built before the loop',
        code(
          ...HEAD,
          'def f(items, size=100):',
          '    parts = [items[i : i + size] for i in range(0, len(items), size)]',
          '    for part in parts:',
          '        requests.post("https://bulk.example.com", json=part, timeout=3)',
        ),
        [],
      ],
      [
        'a loop variable named as a chunk',
        code(
          ...HEAD,
          'def f(groups):',
          '    for chunk in groups:',
          '        Order.objects.bulk_create(chunk)',
        ),
        [],
      ],
      [
        'one item of the chunk per call',
        code(
          ...HEAD,
          'def f(items):',
          '    for batch in itertools.batched(items, 100):',
          '        requests.post("https://one.example.com", json=batch[0], timeout=3)',
        ),
        ['io-in-loop:9 requests.post()|remote'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('stays quiet for a retry loop and flags a loop that continues after a failure', () => {
    const [actual, expected] = outcomes([
      [
        'tenacity attempts',
        code(
          'from tenacity import AsyncRetrying, Retrying, stop_after_attempt',
          '',
          'import requests',
          '',
          '',
          'def f(url):',
          '    for attempt in Retrying(stop=stop_after_attempt(3)):',
          '        with attempt:',
          '            return requests.get(url, timeout=3)',
          '',
          '',
          'async def g(client, url):',
          '    async for attempt in AsyncRetrying(stop=stop_after_attempt(3)):',
          '        with attempt:',
          '            return await client.get(url)',
        ),
        [],
      ],
      [
        'a handler that raises only on the last attempt',
        code(
          'import time',
          '',
          'import requests',
          '',
          '',
          'def f(url):',
          '    for attempt in range(3):',
          '        try:',
          '            return requests.get(url, timeout=3)',
          '        except requests.RequestException:',
          '            if attempt == 2:',
          '                raise',
          '            time.sleep(1)',
        ),
        [],
      ],
      [
        'a try whose else leaves the loop',
        code(
          'import time',
          '',
          'import requests',
          '',
          '',
          'def f(url):',
          '    for _ in range(3):',
          '        try:',
          '            response = requests.get(url, timeout=3)',
          '        except requests.RequestException:',
          '            time.sleep(1)',
          '        else:',
          '            return response',
        ),
        [],
      ],
      [
        'a handler that raises at once',
        code(
          'import requests',
          '',
          '',
          'def f(urls):',
          '    for url in urls:',
          '        try:',
          '            return requests.get(url, timeout=3)',
          '        except requests.RequestException:',
          '            raise',
        ),
        ['io-in-loop:7 requests.get()|remote'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reads the callable of map, filter, a sort key and an executor', () => {
    const [actual, expected] = outcomes([
      [
        'a lambda in map and filter',
        code(
          ...HEAD,
          'def f(urls, ids):',
          '    pages = list(map(lambda url: requests.get(url, timeout=3), urls))',
          '    kept = list(filter(lambda i: Order.objects.filter(pk=i).exists(), ids))',
          '    return pages, kept',
        ),
        [
          'io-in-loop:8 requests.get()|remote',
          'io-in-loop:9 Order.objects.filter(...).exists()|database',
        ],
      ],
      [
        'a sort key',
        code(
          ...HEAD,
          'def f(ids):',
          '    return sorted(ids, key=lambda i: Order.objects.get(pk=i).rank)',
        ),
        ['io-in-loop:8 Order.objects.get()|database'],
      ],
      [
        'an executor map and submit',
        code(
          'from concurrent.futures import ThreadPoolExecutor',
          '',
          'import requests',
          'from shop.models import Order',
          '',
          '',
          'def f(ids, urls):',
          '    with ThreadPoolExecutor(8) as executor:',
          '        orders = list(executor.map(lambda i: Order.objects.get(pk=i), ids))',
          '        pages = list(executor.map(requests.get, urls))',
          '        futures = [executor.submit(Order.objects.get, pk=i) for i in ids]',
          '    return orders, pages, futures',
        ),
        [
          'io-in-loop:9 Order.objects.get()|database|concurrent',
          'io-in-loop:11 Order.objects.get()|database|concurrent',
        ],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
