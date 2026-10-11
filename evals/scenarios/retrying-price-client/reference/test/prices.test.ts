import { afterEach, describe, expect, it, vi } from 'vitest';
import { pricesMain } from '../src/main/composition-root.js';
import { describePrice, fetchPrices } from '../src/main/features/prices/index.js';

type Reply = { readonly status: number; readonly body: string };
type Step = Reply | { readonly reject: Error };

function reply(status: number, body = ''): Reply {
  return { status, body };
}

function harness(
  script: Readonly<Record<string, readonly Step[]>>,
  maxAttempts = 3,
  baseDelayMs = 100,
) {
  const calls: string[] = [];
  const sleeps: number[] = [];
  const steps = new Map(Object.entries(script));
  function fetcher(symbol: string): Promise<Reply> {
    const attempt = calls.filter((call) => call === symbol).length;
    calls.push(symbol);
    const step = steps.get(symbol)?.at(attempt);
    if (step === undefined) {
      return Promise.reject(new Error(`unscripted request ${String(attempt)} for ${symbol}`));
    }
    if ('reject' in step) {
      return Promise.reject(step.reject);
    }
    return Promise.resolve(step);
  }
  function sleep(ms: number): Promise<void> {
    sleeps.push(ms);
    return Promise.resolve();
  }
  return { calls, sleeps, deps: { fetcher, sleep, options: { maxAttempts, baseDelayMs } } };
}

async function fetchOne(steps: readonly Step[], maxAttempts = 3, baseDelayMs = 100) {
  const run = harness({ AAPL: steps }, maxAttempts, baseDelayMs);
  const results = await fetchPrices(['AAPL'], run.deps);
  return { results, calls: run.calls, sleeps: run.sleeps };
}

const boom = { reject: new Error('boom') };

describe('fetchPrices success', () => {
  it.each([
    ['19.99', 1999],
    ['5', 500],
    ['0.07', 7],
    ['5.1', 510],
    ['0', 0],
    ['0.5', 50],
    ['10.00', 1000],
    [' 12.50\n', 1250],
    ['90071992547409.91', 9007199254740991],
  ])('parses %j as %i cents', async (body, cents) => {
    const { results, calls, sleeps } = await fetchOne([reply(200, body)]);
    expect(results).toEqual([{ kind: 'ok', symbol: 'AAPL', cents }]);
    expect(calls).toEqual(['AAPL']);
    expect(sleeps).toEqual([]);
  });

  it.each([200, 204, 299])('treats status %i as a reply to parse', async (status) => {
    const { results } = await fetchOne([reply(status, '1.25')]);
    expect(results).toEqual([{ kind: 'ok', symbol: 'AAPL', cents: 125 }]);
  });
});

describe('fetchPrices bad bodies', () => {
  it.each([
    '',
    'abc',
    '-1.50',
    '+1.50',
    '1e2',
    '19.999',
    '.5',
    '5.',
    '007',
    '1,5',
    '"19.99"',
    'null',
    'x5',
    '5x',
    '1 2',
    '90071992547409.92',
    '99999999999999999999',
  ])('rejects %j without retrying', async (body) => {
    const { results, calls, sleeps } = await fetchOne([reply(200, body)]);
    expect(results).toEqual([{ kind: 'failed', symbol: 'AAPL', reason: 'bad-body' }]);
    expect(calls).toEqual(['AAPL']);
    expect(sleeps).toEqual([]);
  });
});

describe('fetchPrices failures that are not retried', () => {
  it.each([400, 401, 403, 404, 410, 499])('fails status %i as not-found', async (status) => {
    const { results, calls, sleeps } = await fetchOne([reply(status)]);
    expect(results).toEqual([{ kind: 'failed', symbol: 'AAPL', reason: 'not-found' }]);
    expect(calls).toEqual(['AAPL']);
    expect(sleeps).toEqual([]);
  });

  it.each([100, 199, 300, 302, 399, 600, 999])(
    'fails status %i as server-error without retrying',
    async (status) => {
      const { results, calls, sleeps } = await fetchOne([reply(status)]);
      expect(results).toEqual([{ kind: 'failed', symbol: 'AAPL', reason: 'server-error' }]);
      expect(calls).toEqual(['AAPL']);
      expect(sleeps).toEqual([]);
    },
  );
});

describe('fetchPrices retries', () => {
  it('retries 429 with doubling delays and fails as rate-limited', async () => {
    const { results, calls, sleeps } = await fetchOne(
      [reply(429), reply(429), reply(429), reply(429)],
      4,
      100,
    );
    expect(results).toEqual([{ kind: 'failed', symbol: 'AAPL', reason: 'rate-limited' }]);
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([100, 200, 400]);
  });

  it.each([500, 502, 503, 599])('retries status %i and fails as server-error', async (status) => {
    const { results, calls, sleeps } = await fetchOne(
      [reply(status), reply(status), reply(status)],
      3,
      250,
    );
    expect(results).toEqual([{ kind: 'failed', symbol: 'AAPL', reason: 'server-error' }]);
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([250, 500]);
  });

  it('retries a rejected fetcher and fails as network', async () => {
    const { results, calls, sleeps } = await fetchOne([boom, boom, boom], 3, 40);
    expect(results).toEqual([{ kind: 'failed', symbol: 'AAPL', reason: 'network' }]);
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([40, 80]);
  });

  it('succeeds on a later attempt after waiting once per failure', async () => {
    const { results, calls, sleeps } = await fetchOne(
      [reply(503), boom, reply(429), reply(200, '3.5')],
      5,
      10,
    );
    expect(results).toEqual([{ kind: 'ok', symbol: 'AAPL', cents: 350 }]);
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([10, 20, 40]);
  });

  it('reports the reason of the last attempt', async () => {
    const first = await fetchOne([reply(500), boom, reply(429)], 3, 5);
    expect(first.results).toEqual([{ kind: 'failed', symbol: 'AAPL', reason: 'rate-limited' }]);
    const second = await fetchOne([reply(429), reply(429), boom], 3, 5);
    expect(second.results).toEqual([{ kind: 'failed', symbol: 'AAPL', reason: 'network' }]);
    const third = await fetchOne([boom, reply(429), reply(500)], 3, 5);
    expect(third.results).toEqual([{ kind: 'failed', symbol: 'AAPL', reason: 'server-error' }]);
  });

  it('stops retrying at a non-retryable reply', async () => {
    const { results, calls, sleeps } = await fetchOne(
      [reply(500), reply(404), reply(200, '1')],
      5,
      10,
    );
    expect(results).toEqual([{ kind: 'failed', symbol: 'AAPL', reason: 'not-found' }]);
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([10]);
  });

  it('stops retrying at a bad body', async () => {
    const { results, calls, sleeps } = await fetchOne(
      [boom, reply(200, 'oops'), reply(200, '1')],
      5,
      10,
    );
    expect(results).toEqual([{ kind: 'failed', symbol: 'AAPL', reason: 'bad-body' }]);
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([10]);
  });

  it('makes a single attempt and never sleeps when maxAttempts is 1', async () => {
    const { results, calls, sleeps } = await fetchOne([reply(503), reply(200, '1')], 1, 10);
    expect(results).toEqual([{ kind: 'failed', symbol: 'AAPL', reason: 'server-error' }]);
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it('does not sleep after the last attempt', async () => {
    const { sleeps } = await fetchOne([reply(500), reply(500)], 2, 7);
    expect(sleeps).toEqual([7]);
  });
});

describe('fetchPrices over several symbols', () => {
  it('returns results in the order of the symbols', async () => {
    const run = harness({
      AAPL: [reply(200, '1.00')],
      MSFT: [reply(500), reply(200, '2.00')],
      ZZZZ: [reply(404)],
    });
    const results = await fetchPrices(['ZZZZ', 'MSFT', 'AAPL'], run.deps);
    expect(results).toEqual([
      { kind: 'failed', symbol: 'ZZZZ', reason: 'not-found' },
      { kind: 'ok', symbol: 'MSFT', cents: 200 },
      { kind: 'ok', symbol: 'AAPL', cents: 100 },
    ]);
    expect(run.sleeps).toEqual([100]);
  });

  it('resolves an empty list to an empty list', async () => {
    const run = harness({});
    expect(await fetchPrices([], run.deps)).toEqual([]);
    expect(run.calls).toEqual([]);
  });

  it('requests every symbol before any reply arrives', async () => {
    const requested: string[] = [];
    const releases: (() => void)[] = [];
    function fetcher(symbol: string): Promise<Reply> {
      requested.push(symbol);
      return new Promise((resolve) => {
        releases.push(() => {
          resolve(reply(200, '1'));
        });
      });
    }
    const pending = fetchPrices(['A', 'B', 'C'], {
      fetcher,
      sleep: () => Promise.resolve(),
      options: { maxAttempts: 1, baseDelayMs: 1 },
    });
    await vi.waitFor(() => {
      expect(requested).toEqual(['A', 'B', 'C']);
    });
    for (const release of releases) {
      release();
    }
    expect(await pending).toHaveLength(3);
  });
});

describe('describePrice', () => {
  it.each([
    [1999, 'AAPL 19.99'],
    [5, 'AAPL 0.05'],
    [100, 'AAPL 1.00'],
    [0, 'AAPL 0.00'],
    [123456, 'AAPL 1234.56'],
    [510, 'AAPL 5.10'],
  ])('formats %i cents', (cents, line) => {
    expect(describePrice({ kind: 'ok', symbol: 'AAPL', cents })).toBe(line);
  });

  it('formats a failure', () => {
    expect(describePrice({ kind: 'failed', symbol: 'ZZZZ', reason: 'not-found' })).toBe(
      'ZZZZ failed: not-found',
    );
  });
});

describe('pricesMain', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('prints one line per symbol using the global fetch', async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url.endsWith('/AAPL')
          ? new Response('189.5', { status: 200 })
          : new Response('', { status: 404 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await pricesMain(['AAPL', 'A/B']);
    expect(fetchMock.mock.calls).toEqual([
      ['https://prices.example.com/quotes/AAPL'],
      ['https://prices.example.com/quotes/A%2FB'],
    ]);
    expect(write.mock.calls).toEqual([['AAPL 189.50\n'], ['A/B failed: not-found\n']]);
  });

  it('retries with the default 500 ms base delay on the real timer', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => Promise.resolve(new Response('', { status: 503 })));
    vi.stubGlobal('fetch', fetchMock);
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const done = pricesMain(['AAPL']);
    await vi.advanceTimersByTimeAsync(499);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await done;
    expect(write.mock.calls).toEqual([['AAPL failed: server-error\n']]);
  });

  it('reports a rejected fetch as a network failure', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const done = pricesMain(['AAPL']);
    await vi.runAllTimersAsync();
    await done;
    expect(write.mock.calls).toEqual([['AAPL failed: network\n']]);
  });
});
