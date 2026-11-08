import { describe, expect, it, vi } from 'vitest';
import { createBatchUploader } from '../src/main/features/uploads/index.js';

const PENDING = Symbol('pending');

type Item = { id: string };

type Call = {
  ids: string[];
  args: unknown[];
  signal: AbortSignal;
  resolve: () => void;
  reject: (reason: unknown) => void;
};

type Pause = { ms: number; release: () => void };

function items(count: number): Item[] {
  return Array.from({ length: count }, (_, index) => ({ id: `item-${String(index)}` }));
}

function slice(all: Item[], from: number, to?: number): Item[] {
  return all.slice(from, to);
}

async function settle(): Promise<void> {
  for (let tick = 0; tick < 200; tick += 1) {
    await Promise.resolve();
  }
}

function setup(autoSleep = false) {
  const calls: Call[] = [];
  const pauses: Pause[] = [];
  const clock = { time: 1000, reads: 0 };
  const flight = { current: 0, peak: 0 };
  const uploader = createBatchUploader({
    upload: (...args: [readonly Item[], AbortSignal]) => {
      flight.current += 1;
      flight.peak = Math.max(flight.peak, flight.current);
      return new Promise<void>((resolve, reject) => {
        calls.push({
          ids: args[0].map((item) => item.id),
          args,
          signal: args[1],
          resolve: () => {
            flight.current -= 1;
            resolve();
          },
          reject: (reason) => {
            flight.current -= 1;
            reject(reason);
          },
        });
      });
    },
    sleep: (ms) =>
      autoSleep
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            pauses.push({ ms, release: resolve });
          }),
    now: () => {
      clock.reads += 1;
      return clock.time;
    },
  });
  return { uploader, calls, pauses, clock, flight };
}

function opts(batchSize: number, concurrency: number, signal?: AbortSignal) {
  return { batchSize, concurrency, signal: signal ?? new AbortController().signal };
}

function nth<T>(list: T[], index: number): T {
  const found = list[index];
  if (found === undefined) {
    throw new Error(`missing entry ${String(index)}`);
  }
  return found;
}

async function untilCalls(calls: Call[], count: number): Promise<void> {
  await vi.waitFor(() => {
    expect(calls.length).toBe(count);
  });
}

async function untilPauses(pauses: Pause[], count: number): Promise<void> {
  await vi.waitFor(() => {
    expect(pauses.length).toBe(count);
  });
}

async function isPending(promise: Promise<unknown>): Promise<boolean> {
  return (await Promise.race([promise, Promise.resolve(PENDING)])) === PENDING;
}

describe('options', () => {
  it.each([
    [0, 3, 'batchSize'],
    [-4, 3, 'batchSize'],
    [2.5, 3, 'batchSize'],
    [Number.NaN, 3, 'batchSize'],
    [Number.POSITIVE_INFINITY, 3, 'batchSize'],
    [3, 0, 'concurrency'],
    [3, -1, 'concurrency'],
    [3, 1.5, 'concurrency'],
    [3, Number.NaN, 'concurrency'],
    [3, Number.POSITIVE_INFINITY, 'concurrency'],
    [0, 0, 'batchSize'],
  ])('rejects batchSize=%s concurrency=%s with a RangeError naming %s', async (batchSize, concurrency, field) => {
    const { uploader, calls, pauses, clock } = setup();
    const controller = new AbortController();
    controller.abort();
    const attempts = (
      [
        [items(4), undefined],
        [[], undefined],
        [items(4), controller.signal],
      ] as const
    ).map(([list, signal]) => uploader.uploadAll(list, opts(batchSize, concurrency, signal)));
    const settled = await Promise.allSettled(attempts);
    const reasons = settled.map((outcome) =>
      outcome.status === 'rejected' ? (outcome.reason as unknown) : undefined,
    );
    expect(reasons.map((reason) => reason instanceof RangeError)).toEqual([true, true, true]);
    expect(
      reasons.filter(
        (reason) => !String((reason as RangeError).message).includes(`${field} must be a positive integer`),
      ),
    ).toEqual([]);
    expect(calls).toHaveLength(0);
    expect(pauses).toHaveLength(0);
    expect(clock.reads).toBe(0);
  });

  it('accepts batchSize 1 and concurrency 1', async () => {
    const { uploader, calls } = setup();
    const done = uploader.uploadAll(items(1), opts(1, 1));
    await untilCalls(calls, 1);
    nth(calls, 0).resolve();
    expect(await done).toEqual({ kind: 'done', uploaded: 1, failedBatches: [] });
  });
});

describe('batching and summaries of a clean run', () => {
  it('resolves an empty list to done with nothing uploaded', async () => {
    const { uploader, calls, clock } = setup();
    expect(await uploader.uploadAll([], opts(5, 5))).toEqual({
      kind: 'done',
      uploaded: 0,
      failedBatches: [],
    });
    expect(calls).toHaveLength(0);
    expect(clock.reads).toBe(0);
  });

  it('resolves an empty list to done even when the signal is already aborted', async () => {
    const { uploader } = setup();
    const controller = new AbortController();
    controller.abort();
    expect(await uploader.uploadAll([], opts(5, 5, controller.signal))).toEqual({
      kind: 'done',
      uploaded: 0,
      failedBatches: [],
    });
  });

  it('splits items into consecutive batches and passes exactly (batch, signal)', async () => {
    const { uploader, calls } = setup();
    const controller = new AbortController();
    const all = items(8);
    const done = uploader.uploadAll(all, opts(3, 1, controller.signal));
    await untilCalls(calls, 1);
    nth(calls, 0).resolve();
    await untilCalls(calls, 2);
    nth(calls, 1).resolve();
    await untilCalls(calls, 3);
    nth(calls, 2).resolve();
    expect(await done).toEqual({ kind: 'done', uploaded: 8, failedBatches: [] });
    expect(calls.map((call) => call.ids)).toEqual([
      ['item-0', 'item-1', 'item-2'],
      ['item-3', 'item-4', 'item-5'],
      ['item-6', 'item-7'],
    ]);
    expect(calls.map((call) => call.args.length)).toEqual([2, 2, 2]);
    expect(calls.map((call) => call.signal === controller.signal)).toEqual([true, true, true]);
  });

  it('does not add a trailing empty batch when the size divides the count', async () => {
    const { uploader, calls } = setup();
    const done = uploader.uploadAll(items(6), opts(3, 10));
    await untilCalls(calls, 2);
    await settle();
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      call.resolve();
    }
    expect(await done).toEqual({ kind: 'done', uploaded: 6, failedBatches: [] });
  });

  it('uploads one batch when batchSize is larger than the list', async () => {
    const { uploader, calls } = setup();
    const done = uploader.uploadAll(items(3), opts(100, 4));
    await untilCalls(calls, 1);
    await settle();
    expect(calls).toHaveLength(1);
    nth(calls, 0).resolve();
    expect(await done).toEqual({ kind: 'done', uploaded: 3, failedBatches: [] });
  });

  it('does not wait for the first upload to settle before it starts the other slots', async () => {
    const { uploader, calls } = setup();
    const done = uploader.uploadAll(items(4), opts(1, 3));
    await untilCalls(calls, 3);
    expect(calls.map((call) => call.ids)).toEqual([['item-0'], ['item-1'], ['item-2']]);
    for (const call of calls) {
      call.resolve();
    }
    await untilCalls(calls, 4);
    nth(calls, 3).resolve();
    expect(await done).toEqual({ kind: 'done', uploaded: 4, failedBatches: [] });
  });
});

describe('concurrency limit', () => {
  it('refills a slot with the lowest unstarted batch as soon as any batch finishes', async () => {
    const { uploader, calls, flight } = setup();
    const done = uploader.uploadAll(items(6), opts(1, 3));
    await untilCalls(calls, 3);
    await settle();
    expect(calls).toHaveLength(3);
    nth(calls, 2).resolve();
    await untilCalls(calls, 4);
    await settle();
    expect(calls).toHaveLength(4);
    expect(nth(calls, 3).ids).toEqual(['item-3']);
    nth(calls, 0).resolve();
    await untilCalls(calls, 5);
    expect(nth(calls, 4).ids).toEqual(['item-4']);
    nth(calls, 1).resolve();
    await untilCalls(calls, 6);
    expect(nth(calls, 5).ids).toEqual(['item-5']);
    for (const call of calls.slice(3)) {
      call.resolve();
    }
    expect(await done).toEqual({ kind: 'done', uploaded: 6, failedBatches: [] });
    expect(flight.peak).toBe(3);
  });

  it('never exceeds the limit over a long run with settling in arbitrary order', async () => {
    const { uploader, calls, flight } = setup();
    const all = items(60);
    const done = uploader.uploadAll(all, opts(3, 4));
    const settled = new Set<number>();
    for (let guard = 0; guard < 500 && settled.size < 20; guard += 1) {
      await vi.waitFor(() => {
        if (calls.length === 0) {
          throw new Error('no upload has started yet');
        }
      });
      const target = calls.findLast((_, index) => !settled.has(index));
      if (target === undefined) {
        await settle();
        continue;
      }
      settled.add(calls.lastIndexOf(target));
      target.resolve();
      await settle();
    }
    expect(await done).toEqual({ kind: 'done', uploaded: 60, failedBatches: [] });
    expect(flight.peak).toBe(4);
    expect(calls.map((call) => call.ids[0])).toEqual(
      Array.from({ length: 20 }, (_, index) => `item-${String(index * 3)}`),
    );
  });

  it('accepts a limit far above the number of batches', async () => {
    const { uploader, calls, flight } = setup();
    const done = uploader.uploadAll(items(3), opts(1, 1_000_000_000));
    await untilCalls(calls, 3);
    for (const call of calls) {
      call.resolve();
    }
    expect(await done).toEqual({ kind: 'done', uploaded: 3, failedBatches: [] });
    expect(flight.peak).toBe(3);
  });

  it('applies the limit to each call separately and keeps their results apart', async () => {
    const { uploader, calls, flight } = setup(true);
    const first = uploader.uploadAll(items(2), opts(1, 1));
    const second = uploader.uploadAll(items(4), opts(2, 1));
    await untilCalls(calls, 2);
    await settle();
    expect(flight.peak).toBe(2);
    expect(calls.map((call) => call.ids)).toEqual([['item-0'], ['item-0', 'item-1']]);
    nth(calls, 1).reject(new Error('one'));
    await untilCalls(calls, 3);
    expect(nth(calls, 2).ids).toEqual(['item-0', 'item-1']);
    nth(calls, 0).resolve();
    await untilCalls(calls, 4);
    nth(calls, 3).resolve();
    nth(calls, 2).reject(new Error('two'));
    await vi.waitFor(() => {
      expect(calls.length).toBe(5);
    });
    nth(calls, 4).resolve();
    expect(await first).toEqual({ kind: 'done', uploaded: 2, failedBatches: [] });
    expect(await second).toEqual({
      kind: 'done',
      uploaded: 2,
      failedBatches: [{ index: 0, items: items(4).slice(0, 2), reason: 'two', failedAt: 1000 }],
    });
  });

  it('can run the same uploader again after a finished run', async () => {
    const { uploader, calls } = setup();
    const runRound = async (round: number) => {
      const done = uploader.uploadAll(items(2), opts(1, 1));
      await untilCalls(calls, round * 2 - 1);
      nth(calls, round * 2 - 2).resolve();
      await untilCalls(calls, round * 2);
      nth(calls, round * 2 - 1).resolve();
      expect(await done).toEqual({ kind: 'done', uploaded: 2, failedBatches: [] });
    };
    await runRound(1);
    await runRound(2);
  });
});

describe('retry', () => {
  it('sleeps exactly 1000 ms once, then uploads the same batch again with the same signal', async () => {
    const { uploader, calls, pauses, clock } = setup();
    const controller = new AbortController();
    const done = uploader.uploadAll(items(3), opts(3, 2, controller.signal));
    await untilCalls(calls, 1);
    nth(calls, 0).reject(new Error('flaky'));
    await untilPauses(pauses, 1);
    await settle();
    expect(nth(pauses, 0).ms).toBe(1000);
    expect(calls).toHaveLength(1);
    nth(pauses, 0).release();
    await untilCalls(calls, 2);
    expect(nth(calls, 1).ids).toEqual(['item-0', 'item-1', 'item-2']);
    expect(nth(calls, 1).args).toHaveLength(2);
    expect(nth(calls, 1).signal).toBe(controller.signal);
    nth(calls, 1).resolve();
    expect(await done).toEqual({ kind: 'done', uploaded: 3, failedBatches: [] });
    expect(pauses).toHaveLength(1);
    expect(clock.reads).toBe(0);
  });

  it('gives up after the second rejection: reason and time come from the second attempt', async () => {
    const { uploader, calls, pauses, clock } = setup();
    const all = items(2);
    const done = uploader.uploadAll(all, opts(2, 1));
    await untilCalls(calls, 1);
    clock.time = 2000;
    nth(calls, 0).reject(new Error('first failure'));
    await untilPauses(pauses, 1);
    clock.time = 3000;
    nth(pauses, 0).release();
    await untilCalls(calls, 2);
    clock.time = 4000;
    nth(calls, 1).reject(new Error('second failure'));
    expect(await done).toEqual({
      kind: 'done',
      uploaded: 0,
      failedBatches: [{ index: 0, items: all, reason: 'second failure', failedAt: 4000 }],
    });
    await settle();
    expect(calls).toHaveLength(2);
    expect(pauses).toHaveLength(1);
    expect(clock.reads).toBe(1);
  });

  it.each([
    [42, '42'],
    ['just text', 'just text'],
    [undefined, 'undefined'],
    [null, 'null'],
    [false, 'false'],
    [new TypeError('typed'), 'typed'],
  ])('uses %j from the second attempt as the reason %j', async (value, reason) => {
    const { uploader, calls, pauses } = setup();
    const done = uploader.uploadAll(items(1), opts(1, 1));
    await untilCalls(calls, 1);
    nth(calls, 0).reject(new Error('ignored'));
    await untilPauses(pauses, 1);
    nth(pauses, 0).release();
    await untilCalls(calls, 2);
    nth(calls, 1).reject(value);
    expect(await done).toEqual({
      kind: 'done',
      uploaded: 0,
      failedBatches: [{ index: 0, items: items(1), reason, failedAt: 1000 }],
    });
  });

  it('treats a synchronous throw like a rejection', async () => {
    const attempts: string[][] = [];
    const sleeps: number[] = [];
    const uploader = createBatchUploader({
      upload: (batch) => {
        attempts.push(batch.map((item) => item.id));
        throw new Error('thrown');
      },
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      now: () => 77,
    });
    expect(await uploader.uploadAll(items(2), opts(2, 2))).toEqual({
      kind: 'done',
      uploaded: 0,
      failedBatches: [{ index: 0, items: items(2), reason: 'thrown', failedAt: 77 }],
    });
    expect(attempts).toEqual([
      ['item-0', 'item-1'],
      ['item-0', 'item-1'],
    ]);
    expect(sleeps).toEqual([1000]);
  });

  it('lists failed batches by batch index however they finish, counting only uploaded items', async () => {
    const { uploader, calls, pauses, clock } = setup();
    const all = items(7);
    const done = uploader.uploadAll(all, opts(2, 4));
    await untilCalls(calls, 4);
    nth(calls, 3).reject(new Error('d'));
    nth(calls, 1).reject(new Error('b'));
    nth(calls, 2).resolve();
    nth(calls, 0).reject(new Error('a'));
    await untilPauses(pauses, 3);
    for (const pause of pauses) {
      pause.release();
    }
    await untilCalls(calls, 7);
    const retried = calls.slice(4).map((call) => call.ids[0]);
    expect(retried).toEqual(['item-6', 'item-2', 'item-0']);
    const byFirstItem = new Map(calls.slice(4).map((call) => [call.ids[0], call]));
    clock.time = 11;
    byFirstItem.get('item-6')?.reject(new Error('d2'));
    await settle();
    clock.time = 22;
    byFirstItem.get('item-2')?.reject(new Error('b2'));
    await settle();
    clock.time = 33;
    byFirstItem.get('item-0')?.resolve();
    expect(await done).toEqual({
      kind: 'done',
      uploaded: 4,
      failedBatches: [
        { index: 1, items: slice(all, 2, 4), reason: 'b2', failedAt: 22 },
        { index: 3, items: slice(all, 6), reason: 'd2', failedAt: 11 },
      ],
    });
    expect(clock.reads).toBe(2);
  });

  it('keeps the slot while the retry wait is pending', async () => {
    const { uploader, calls, pauses } = setup();
    const done = uploader.uploadAll(items(2), opts(1, 1));
    await untilCalls(calls, 1);
    nth(calls, 0).reject(new Error('x'));
    await untilPauses(pauses, 1);
    await settle();
    expect(calls).toHaveLength(1);
    nth(pauses, 0).release();
    await untilCalls(calls, 2);
    await settle();
    expect(calls.map((call) => call.ids)).toEqual([['item-0'], ['item-0']]);
    nth(calls, 1).resolve();
    await untilCalls(calls, 3);
    expect(nth(calls, 2).ids).toEqual(['item-1']);
    nth(calls, 2).resolve();
    expect(await done).toEqual({ kind: 'done', uploaded: 2, failedBatches: [] });
  });

  it('keeps the slot of a batch whose retry is in flight', async () => {
    const { uploader, calls, pauses, flight } = setup(true);
    const done = uploader.uploadAll(items(3), opts(1, 2));
    await untilCalls(calls, 2);
    nth(calls, 0).reject(new Error('x'));
    await untilCalls(calls, 3);
    await settle();
    expect(calls.map((call) => call.ids)).toEqual([['item-0'], ['item-1'], ['item-0']]);
    nth(calls, 2).resolve();
    await untilCalls(calls, 4);
    expect(nth(calls, 3).ids).toEqual(['item-2']);
    nth(calls, 1).resolve();
    nth(calls, 3).resolve();
    expect(await done).toEqual({ kind: 'done', uploaded: 3, failedBatches: [] });
    expect(flight.peak).toBe(2);
    expect(pauses).toHaveLength(0);
  });

  it('does not block other slots while one batch waits to retry', async () => {
    const { uploader, calls, pauses } = setup();
    const done = uploader.uploadAll(items(4), opts(1, 2));
    await untilCalls(calls, 2);
    nth(calls, 0).reject(new Error('x'));
    await untilPauses(pauses, 1);
    nth(calls, 1).resolve();
    await untilCalls(calls, 3);
    expect(nth(calls, 2).ids).toEqual(['item-2']);
    nth(calls, 2).resolve();
    await untilCalls(calls, 4);
    expect(nth(calls, 3).ids).toEqual(['item-3']);
    nth(calls, 3).resolve();
    await settle();
    expect(await isPending(done)).toBe(true);
    nth(pauses, 0).release();
    await untilCalls(calls, 5);
    nth(calls, 4).resolve();
    expect(await done).toEqual({ kind: 'done', uploaded: 4, failedBatches: [] });
  });

  it('keeps going after a batch has failed', async () => {
    const { uploader, calls } = setup(true);
    const all = items(3);
    const done = uploader.uploadAll(all, opts(1, 1));
    await untilCalls(calls, 1);
    nth(calls, 0).reject('a');
    await untilCalls(calls, 2);
    nth(calls, 1).reject('b');
    await untilCalls(calls, 3);
    nth(calls, 2).resolve();
    await untilCalls(calls, 4);
    nth(calls, 3).resolve();
    expect(await done).toEqual({
      kind: 'done',
      uploaded: 2,
      failedBatches: [{ index: 0, items: slice(all, 0, 1), reason: 'b', failedAt: 1000 }],
    });
    expect(calls.map((call) => call.ids)).toEqual([['item-0'], ['item-0'], ['item-1'], ['item-2']]);
  });
});

describe('abort', () => {
  it('starts nothing when the signal is already aborted', async () => {
    const { uploader, calls, clock } = setup();
    const controller = new AbortController();
    controller.abort();
    const all = items(5);
    expect(await uploader.uploadAll(all, opts(2, 3, controller.signal))).toEqual({
      kind: 'aborted',
      uploaded: 0,
      failedBatches: [],
      notStarted: all,
    });
    expect(calls).toHaveLength(0);
    expect(clock.reads).toBe(0);
  });

  it('stops starting batches, waits for the started ones, and lists the rest in order', async () => {
    const { uploader, calls } = setup();
    const controller = new AbortController();
    const all = items(11);
    const done = uploader.uploadAll(all, opts(2, 2, controller.signal));
    await untilCalls(calls, 2);
    controller.abort();
    nth(calls, 1).resolve();
    await settle();
    expect(calls).toHaveLength(2);
    expect(await isPending(done)).toBe(true);
    nth(calls, 0).resolve();
    expect(await done).toEqual({
      kind: 'aborted',
      uploaded: 4,
      failedBatches: [],
      notStarted: slice(all, 4),
    });
    expect(calls).toHaveLength(2);
  });

  it('does not cancel a retry wait or the retry of a batch that had started', async () => {
    const { uploader, calls, pauses } = setup();
    const controller = new AbortController();
    const all = items(6);
    const done = uploader.uploadAll(all, opts(2, 2, controller.signal));
    await untilCalls(calls, 2);
    nth(calls, 0).reject(new Error('x'));
    await untilPauses(pauses, 1);
    controller.abort();
    nth(calls, 1).resolve();
    await settle();
    expect(calls).toHaveLength(2);
    expect(await isPending(done)).toBe(true);
    nth(pauses, 0).release();
    await untilCalls(calls, 3);
    expect(nth(calls, 2).ids).toEqual(['item-0', 'item-1']);
    expect(nth(calls, 2).signal.aborted).toBe(true);
    nth(calls, 2).resolve();
    expect(await done).toEqual({
      kind: 'aborted',
      uploaded: 4,
      failedBatches: [],
      notStarted: slice(all, 4),
    });
  });

  it('reports failed in-flight batches next to the batches that never started', async () => {
    const { uploader, calls, pauses, clock } = setup();
    const controller = new AbortController();
    const all = items(5);
    const done = uploader.uploadAll(all, opts(2, 1, controller.signal));
    await untilCalls(calls, 1);
    controller.abort();
    nth(calls, 0).reject(new Error('a'));
    await untilPauses(pauses, 1);
    nth(pauses, 0).release();
    await untilCalls(calls, 2);
    clock.time = 4242;
    nth(calls, 1).reject(new Error('b'));
    expect(await done).toEqual({
      kind: 'aborted',
      uploaded: 0,
      failedBatches: [{ index: 0, items: slice(all, 0, 2), reason: 'b', failedAt: 4242 }],
      notStarted: slice(all, 2),
    });
  });

  it('is done, not aborted, when every batch had already started', async () => {
    const { uploader, calls } = setup();
    const controller = new AbortController();
    const done = uploader.uploadAll(items(5), opts(2, 3, controller.signal));
    await untilCalls(calls, 3);
    controller.abort();
    for (const call of calls) {
      call.resolve();
    }
    expect(await done).toEqual({ kind: 'done', uploaded: 5, failedBatches: [] });
  });

  it('checks the signal before every start, not once at the beginning', async () => {
    const { uploader, calls } = setup();
    const controller = new AbortController();
    const all = items(5);
    const done = uploader.uploadAll(all, opts(1, 1, controller.signal));
    await untilCalls(calls, 1);
    nth(calls, 0).resolve();
    await untilCalls(calls, 2);
    nth(calls, 1).resolve();
    await untilCalls(calls, 3);
    controller.abort();
    nth(calls, 2).resolve();
    expect(await done).toEqual({
      kind: 'aborted',
      uploaded: 3,
      failedBatches: [],
      notStarted: slice(all, 3),
    });
    expect(calls).toHaveLength(3);
  });

  it('does not reuse the abort state of an earlier call', async () => {
    const { uploader, calls } = setup();
    const aborted = new AbortController();
    aborted.abort();
    await uploader.uploadAll(items(2), opts(1, 1, aborted.signal));
    const done = uploader.uploadAll(items(1), opts(1, 1));
    await untilCalls(calls, 1);
    nth(calls, 0).resolve();
    expect(await done).toEqual({ kind: 'done', uploaded: 1, failedBatches: [] });
  });
});
