import { afterEach, describe, expect, it, vi } from 'vitest';
import { pricesMain } from '../src/main/composition-root.js';
import { describePrice, fetchPrices } from '../src/main/features/prices/index.js';

type Reply = { status: number; body: string };
type Step = Reply | { reject: unknown };

function ok(body: string): Reply {
  return { status: 200, body };
}

function status(code: number): Reply {
  return { status: code, body: '' };
}

function scripted(steps: Record<string, Step[]>, maxAttempts: number, baseDelayMs: number) {
  const requests: string[] = [];
  const sleeps: number[] = [];
  const fetcher = async (symbol: string): Promise<Reply> => {
    const seen = requests.filter((entry) => entry === symbol).length;
    requests.push(symbol);
    const step = steps[symbol]?.[seen];
    if (step === undefined) {
      throw new Error(`no scripted step ${seen} for ${symbol}`);
    }
    if ('reject' in step) {
      throw step.reject;
    }
    return step;
  };
  const sleep = async (ms: number): Promise<void> => {
    sleeps.push(ms);
  };
  return { requests, sleeps, deps: { fetcher, sleep, options: { maxAttempts, baseDelayMs } } };
}

async function single(steps: Step[], maxAttempts = 3, baseDelayMs = 100) {
  const run = scripted({ SYM: steps }, maxAttempts, baseDelayMs);
  const results = await fetchPrices(['SYM'], run.deps);
  return { results, requests: run.requests.length, sleeps: run.sleeps };
}

function failed(reason: string) {
  return [{ kind: 'failed', symbol: 'SYM', reason }];
}

describe('parsing a successful reply into integer cents', () => {
  it.each([
    ['19.99', 1999],
    ['5', 500],
    ['0.07', 7],
    ['0.05', 5],
    ['5.1', 510],
    ['5.10', 510],
    ['0', 0],
    ['0.00', 0],
    ['1234567.89', 123456789],
    ['1.15', 115],
    ['8.2', 820],
    ['4.35', 435],
    ['\n12.50 \n', 1250],
    ['90071992547409.91', 9007199254740991],
  ])('%j is %i cents', async (body, cents) => {
    const outcome = await single([ok(body)]);
    expect(outcome.results).toEqual([{ kind: 'ok', symbol: 'SYM', cents }]);
    expect(outcome.requests).toBe(1);
    expect(outcome.sleeps).toEqual([]);
  });

  it.each([200, 201, 250, 299])('status %i is parsed', async (code) => {
    const outcome = await single([{ status: code, body: '2.5' }]);
    expect(outcome.results).toEqual([{ kind: 'ok', symbol: 'SYM', cents: 250 }]);
  });

  it.each([
    '',
    '   ',
    'abc',
    'NaN',
    'Infinity',
    'null',
    '"19.99"',
    '-1.50',
    '-0',
    '+1',
    '1e2',
    '1E2',
    '19.999',
    '1.',
    '.5',
    '007',
    '00.5',
    '1,50',
    '1 2',
    '$5',
    '5x',
    '0x10',
    '{"price":5}',
    '90071992547409.92',
    '99999999999999999999.99',
  ])('%j is a bad body, never retried', async (body) => {
    const outcome = await single([ok(body), ok('1.00')], 5, 100);
    expect(outcome.results).toEqual(failed('bad-body'));
    expect(outcome.requests).toBe(1);
    expect(outcome.sleeps).toEqual([]);
  });
});

describe('failures that are never retried', () => {
  it.each([400, 401, 403, 404, 405, 410, 418, 422, 451, 499])(
    'status %i is not-found after one attempt',
    async (code) => {
      const outcome = await single([status(code), ok('1')], 5, 100);
      expect(outcome.results).toEqual(failed('not-found'));
      expect(outcome.requests).toBe(1);
      expect(outcome.sleeps).toEqual([]);
    },
  );

  it.each([100, 101, 199, 300, 301, 304, 399, 600, 700, 999])(
    'status %i is server-error after one attempt',
    async (code) => {
      const outcome = await single([status(code), ok('1')], 5, 100);
      expect(outcome.results).toEqual(failed('server-error'));
      expect(outcome.requests).toBe(1);
      expect(outcome.sleeps).toEqual([]);
    },
  );
});

describe('retried failures', () => {
  it('429 exhausts every attempt with doubling delays', async () => {
    const outcome = await single(
      [status(429), status(429), status(429), status(429), ok('1')],
      4,
      100,
    );
    expect(outcome.results).toEqual(failed('rate-limited'));
    expect(outcome.requests).toBe(4);
    expect(outcome.sleeps).toEqual([100, 200, 400]);
  });

  it.each([500, 501, 502, 503, 504, 599])('status %i exhausts as server-error', async (code) => {
    const outcome = await single(
      [status(code), status(code), status(code), status(code), ok('1')],
      4,
      250,
    );
    expect(outcome.results).toEqual(failed('server-error'));
    expect(outcome.requests).toBe(4);
    expect(outcome.sleeps).toEqual([250, 500, 1000]);
  });

  it.each([
    ['an Error', new Error('socket hang up')],
    ['a string', 'ECONNRESET'],
    ['undefined', undefined],
  ])('a fetcher rejecting with %s exhausts as network', async (_label, cause) => {
    const outcome = await single(
      [{ reject: cause }, { reject: cause }, { reject: cause }, ok('1')],
      3,
      30,
    );
    expect(outcome.results).toEqual(failed('network'));
    expect(outcome.requests).toBe(3);
    expect(outcome.sleeps).toEqual([30, 60]);
  });

  it('succeeds on the last allowed attempt', async () => {
    const outcome = await single(
      [status(500), { reject: new Error('x') }, status(429), ok('7.25')],
      4,
      8,
    );
    expect(outcome.results).toEqual([{ kind: 'ok', symbol: 'SYM', cents: 725 }]);
    expect(outcome.requests).toBe(4);
    expect(outcome.sleeps).toEqual([8, 16, 32]);
  });

  it('succeeds on the first retry', async () => {
    const outcome = await single([status(503), ok('0.99')], 5, 1000);
    expect(outcome.results).toEqual([{ kind: 'ok', symbol: 'SYM', cents: 99 }]);
    expect(outcome.requests).toBe(2);
    expect(outcome.sleeps).toEqual([1000]);
  });

  it('reports the reason of the last attempt', async () => {
    const a = await single([status(500), { reject: new Error('x') }, status(429)], 3, 1);
    expect(a.results).toEqual(failed('rate-limited'));
    const b = await single([status(429), status(500), { reject: new Error('x') }], 3, 1);
    expect(b.results).toEqual(failed('network'));
    const c = await single([{ reject: new Error('x') }, status(429), status(502)], 3, 1);
    expect(c.results).toEqual(failed('server-error'));
  });

  it('stops at a non-retryable reply in the middle of the retries', async () => {
    const outcome = await single([status(429), status(404), ok('1')], 5, 20);
    expect(outcome.results).toEqual(failed('not-found'));
    expect(outcome.requests).toBe(2);
    expect(outcome.sleeps).toEqual([20]);
  });

  it('stops at a bad body in the middle of the retries', async () => {
    const outcome = await single([{ reject: new Error('x') }, ok('free'), ok('1')], 5, 20);
    expect(outcome.results).toEqual(failed('bad-body'));
    expect(outcome.requests).toBe(2);
    expect(outcome.sleeps).toEqual([20]);
  });

  it('maxAttempts 1 means one request and no sleep', async () => {
    const outcome = await single([status(500), ok('1')], 1, 100);
    expect(outcome.results).toEqual(failed('server-error'));
    expect(outcome.requests).toBe(1);
    expect(outcome.sleeps).toEqual([]);
  });

  it('maxAttempts 2 sleeps once', async () => {
    const outcome = await single([status(429), status(429), ok('1')], 2, 15);
    expect(outcome.results).toEqual(failed('rate-limited'));
    expect(outcome.requests).toBe(2);
    expect(outcome.sleeps).toEqual([15]);
  });

  it('calls the fetcher with the symbol alone', async () => {
    const fetcher = vi.fn(async (_symbol: string) => ok('1'));
    await fetchPrices(['AAPL'], {
      fetcher,
      sleep: async () => undefined,
      options: { maxAttempts: 2, baseDelayMs: 1 },
    });
    expect(fetcher.mock.calls).toEqual([['AAPL']]);
  });

  it('passes the exact millisecond value to sleep', async () => {
    const sleep = vi.fn(async (_ms: number) => undefined);
    await fetchPrices(['AAPL'], {
      fetcher: async () => status(503),
      sleep,
      options: { maxAttempts: 4, baseDelayMs: 3 },
    });
    expect(sleep.mock.calls).toEqual([[3], [6], [12]]);
  });
});

describe('several symbols', () => {
  it('keeps the order of the symbols and retries each on its own', async () => {
    const run = scripted(
      {
        AAA: [ok('1.00')],
        BBB: [status(429), status(429), status(429)],
        CCC: [status(404)],
        DDD: [{ reject: new Error('x') }, ok('2.50')],
        EEE: [ok('nope')],
      },
      3,
      100,
    );
    const results = await fetchPrices(['EEE', 'DDD', 'CCC', 'BBB', 'AAA'], run.deps);
    expect(results).toEqual([
      { kind: 'failed', symbol: 'EEE', reason: 'bad-body' },
      { kind: 'ok', symbol: 'DDD', cents: 250 },
      { kind: 'failed', symbol: 'CCC', reason: 'not-found' },
      { kind: 'failed', symbol: 'BBB', reason: 'rate-limited' },
      { kind: 'ok', symbol: 'AAA', cents: 100 },
    ]);
    expect(run.requests.filter((symbol) => symbol === 'BBB')).toHaveLength(3);
    expect(run.requests.filter((symbol) => symbol === 'DDD')).toHaveLength(2);
    expect(run.requests).toHaveLength(1 + 2 + 1 + 3 + 1);
    expect([...run.sleeps].sort((left, right) => left - right)).toEqual([100, 100, 200]);
  });

  it('resolves an empty list without any request', async () => {
    const run = scripted({}, 3, 100);
    expect(await fetchPrices([], run.deps)).toEqual([]);
    expect(run.requests).toEqual([]);
    expect(run.sleeps).toEqual([]);
  });

  it('requests every symbol before any reply arrives', async () => {
    const requested: string[] = [];
    const gates: Array<() => void> = [];
    const pending = fetchPrices(['A', 'B', 'C', 'D'], {
      fetcher: (symbol) => {
        requested.push(symbol);
        return new Promise<Reply>((resolve) => {
          gates.push(() => {
            resolve(ok('1'));
          });
        });
      },
      sleep: async () => undefined,
      options: { maxAttempts: 2, baseDelayMs: 1 },
    });
    await vi.waitFor(() => {
      expect(requested).toEqual(['A', 'B', 'C', 'D']);
    });
    for (const open of gates) {
      open();
    }
    const results = await pending;
    expect(results.map((result) => result.symbol)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('a symbol waiting in sleep does not hold back the others', async () => {
    const sleepers: Array<() => void> = [];
    const requests: string[] = [];
    const pending = fetchPrices(['SLOW', 'FAST'], {
      fetcher: async (symbol) => {
        requests.push(symbol);
        return symbol === 'SLOW' && requests.filter((entry) => entry === 'SLOW').length === 1
          ? status(503)
          : ok('1');
      },
      sleep: (_ms) =>
        new Promise<void>((resolve) => {
          sleepers.push(resolve);
        }),
      options: { maxAttempts: 2, baseDelayMs: 1 },
    });
    await vi.waitFor(() => {
      expect(sleepers).toHaveLength(1);
    });
    expect(requests).toEqual(['SLOW', 'FAST']);
    for (const wake of sleepers) {
      wake();
    }
    expect(await pending).toEqual([
      { kind: 'ok', symbol: 'SLOW', cents: 100 },
      { kind: 'ok', symbol: 'FAST', cents: 100 },
    ]);
  });
});

describe('describePrice', () => {
  it.each([
    [1999, 'AAPL 19.99'],
    [5, 'AAPL 0.05'],
    [9, 'AAPL 0.09'],
    [10, 'AAPL 0.10'],
    [99, 'AAPL 0.99'],
    [100, 'AAPL 1.00'],
    [101, 'AAPL 1.01'],
    [0, 'AAPL 0.00'],
    [510, 'AAPL 5.10'],
    [123456789, 'AAPL 1234567.89'],
    [9007199254740991, 'AAPL 90071992547409.91'],
  ])('formats %i cents', (cents, line) => {
    expect(describePrice({ kind: 'ok', symbol: 'AAPL', cents })).toBe(line);
  });

  it.each(['not-found', 'rate-limited', 'server-error', 'network', 'bad-body'] as const)(
    'formats the %s failure',
    (reason) => {
      expect(describePrice({ kind: 'failed', symbol: 'ZZZZ', reason })).toBe(
        `ZZZZ failed: ${reason}`,
      );
    },
  );
});

describe('pricesMain', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function capture() {
    const chunks: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      chunks.push(String(chunk));
      return true;
    });
    return chunks;
  }

  it('prints one line per symbol in order using the global fetch', async () => {
    const urls: unknown[][] = [];
    vi.stubGlobal('fetch', async (...args: unknown[]) => {
      urls.push(args);
      const url = String(args[0]);
      if (url.endsWith('/AAPL')) {
        return new Response('189.5\n', { status: 200 });
      }
      if (url.endsWith('/MSFT')) {
        return new Response('0.07', { status: 200 });
      }
      return new Response('missing', { status: 404 });
    });
    const chunks = capture();
    await pricesMain(['AAPL', 'ZZZZ', 'MSFT']);
    expect(chunks.join('')).toBe('AAPL 189.50\nZZZZ failed: not-found\nMSFT 0.07\n');
    expect(urls).toEqual([
      ['https://prices.example.com/quotes/AAPL'],
      ['https://prices.example.com/quotes/ZZZZ'],
      ['https://prices.example.com/quotes/MSFT'],
    ]);
  });

  it('url-encodes the symbol', async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response('1', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const chunks = capture();
    await pricesMain(['BRK/B', 'A B']);
    expect(fetchMock.mock.calls).toEqual([
      ['https://prices.example.com/quotes/BRK%2FB'],
      ['https://prices.example.com/quotes/A%20B'],
    ]);
    expect(chunks.join('')).toBe('BRK/B 1.00\nA B 1.00\n');
  });

  it('prints nothing for no symbols', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const chunks = capture();
    await pricesMain([]);
    expect(chunks).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('waits 500 ms and then 1000 ms on the real timer before giving up after 3 attempts', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_url: string) => new Response('', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    const chunks = capture();
    const done = pricesMain(['AAPL']);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await done;
    expect(vi.getTimerCount()).toBe(0);
    expect(chunks.join('')).toBe('AAPL failed: rate-limited\n');
  });

  it('succeeds after a retry and prints the price', async () => {
    vi.useFakeTimers();
    const replies = [new Response('', { status: 502 }), new Response('42.1', { status: 200 })];
    const fetchMock = vi.fn(async (_url: string) => {
      const next = replies.shift();
      if (next === undefined) {
        throw new Error('too many requests');
      }
      return next;
    });
    vi.stubGlobal('fetch', fetchMock);
    const chunks = capture();
    const done = pricesMain(['AAPL']);
    await vi.advanceTimersByTimeAsync(500);
    await done;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(chunks.join('')).toBe('AAPL 42.10\n');
  });

  it('reports a rejecting fetch as a network failure after three attempts', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_url: string): Promise<Response> => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', fetchMock);
    const chunks = capture();
    const done = pricesMain(['AAPL']);
    await vi.runAllTimersAsync();
    await done;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(chunks.join('')).toBe('AAPL failed: network\n');
  });

  it('reads the body once per reply and treats an unreadable body as a network failure', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_url: string) => ({
      status: 200,
      text: async (): Promise<string> => {
        throw new TypeError('terminated');
      },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const chunks = capture();
    const done = pricesMain(['AAPL']);
    await vi.runAllTimersAsync();
    await done;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(chunks.join('')).toBe('AAPL failed: network\n');
  });
});
