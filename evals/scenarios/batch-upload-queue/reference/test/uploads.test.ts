import { describe, expect, it, vi } from 'vitest';
import { createBatchUploader } from '../src/main/features/uploads/index.js';

type Deps = Parameters<typeof createBatchUploader>[0];
type Item = Parameters<Deps['upload']>[0][number];

type Call = {
  readonly ids: readonly string[];
  readonly argumentCount: number;
  readonly signal: AbortSignal;
  readonly finish: () => void;
  readonly fail: (error: Error) => void;
};

type Wait = { readonly ms: number; readonly release: () => void };

const PENDING = Symbol('pending');
const SETTLE_TICKS = Array.from({ length: 40 }, (_, tick) => tick);

function makeItems(count: number): readonly Item[] {
  return Array.from({ length: count }, (_, index) => ({ id: `i${String(index)}` }));
}

function idsOf(items: readonly Item[]): readonly string[] {
  return items.map((item) => item.id);
}

async function settle(): Promise<void> {
  for (const tick of SETTLE_TICKS) {
    await Promise.resolve(tick);
  }
}

function harness() {
  const calls: Call[] = [];
  const waits: Wait[] = [];
  const clock = { time: 0, reads: 0 };
  const flight = { current: 0, peak: 0 };
  function upload(...args: Parameters<Deps['upload']>): Promise<void> {
    const [batch, signal] = args;
    flight.current += 1;
    flight.peak = Math.max(flight.peak, flight.current);
    return new Promise<void>((resolve, reject) => {
      calls.push({
        ids: idsOf(batch),
        argumentCount: args.length,
        signal,
        finish: () => {
          flight.current -= 1;
          resolve();
        },
        fail: (error) => {
          flight.current -= 1;
          reject(error);
        },
      });
    });
  }
  function sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      waits.push({ ms, release: resolve });
    });
  }
  function now(): number {
    clock.reads += 1;
    return clock.time;
  }
  const deps: Deps = { upload, sleep, now };
  return { calls, waits, clock, flight, uploader: createBatchUploader(deps) };
}

function callAt(calls: readonly Call[], index: number): Call {
  const call = calls.at(index);
  if (call === undefined) {
    throw new Error(`no upload call ${String(index)}`);
  }
  return call;
}

function waitAt(waits: readonly Wait[], index: number): Wait {
  const wait = waits.at(index);
  if (wait === undefined) {
    throw new Error(`no sleep call ${String(index)}`);
  }
  return wait;
}

async function waitForCalls(calls: readonly Call[], count: number): Promise<void> {
  await vi.waitFor(() => {
    expect(calls).toHaveLength(count);
  });
}

async function waitForWaits(waits: readonly Wait[], count: number): Promise<void> {
  await vi.waitFor(() => {
    expect(waits).toHaveLength(count);
  });
}

function options(batchSize: number, concurrency: number, signal = new AbortController().signal) {
  return { batchSize, concurrency, signal };
}

async function isPending(promise: Promise<unknown>): Promise<boolean> {
  return (await Promise.race([promise, Promise.resolve(PENDING)])) === PENDING;
}

describe('option validation', () => {
  it.each([
    [0, 1, 'batchSize'],
    [-1, 1, 'batchSize'],
    [1.5, 1, 'batchSize'],
    [Number.NaN, 1, 'batchSize'],
    [Number.POSITIVE_INFINITY, 1, 'batchSize'],
    [1, 0, 'concurrency'],
    [1, -2, 'concurrency'],
    [1, 2.5, 'concurrency'],
    [1, Number.NaN, 'concurrency'],
    [1, Number.POSITIVE_INFINITY, 'concurrency'],
    [0, 0, 'batchSize'],
  ])(
    'rejects batchSize %j with concurrency %j naming %s',
    async (batchSize, concurrency, field) => {
      const run = harness();
      await expect(
        run.uploader.uploadAll(makeItems(3), options(batchSize, concurrency)),
      ).rejects.toThrow(new RangeError(`${field} must be a positive integer`));
      await expect(
        run.uploader.uploadAll([], options(batchSize, concurrency)),
      ).rejects.toBeInstanceOf(RangeError);
      expect(run.calls).toHaveLength(0);
      expect(run.waits).toHaveLength(0);
      expect(run.clock.reads).toBe(0);
    },
  );
});

describe('batching', () => {
  it('resolves an empty list to an empty done summary without calling anything', async () => {
    const run = harness();
    expect(await run.uploader.uploadAll([], options(3, 2))).toEqual({
      kind: 'done',
      uploaded: 0,
      failedBatches: [],
    });
    expect(run.calls).toHaveLength(0);
  });

  it('resolves an empty list as done even when the signal is already aborted', async () => {
    const run = harness();
    const controller = new AbortController();
    controller.abort();
    expect(await run.uploader.uploadAll([], options(3, 2, controller.signal))).toEqual({
      kind: 'done',
      uploaded: 0,
      failedBatches: [],
    });
  });

  it('uploads consecutive batches in order, the last one smaller', async () => {
    const run = harness();
    const controller = new AbortController();
    const done = run.uploader.uploadAll(makeItems(7), options(3, 1, controller.signal));
    for (const round of [1, 2, 3]) {
      await waitForCalls(run.calls, round);
      callAt(run.calls, round - 1).finish();
    }
    expect(await done).toEqual({ kind: 'done', uploaded: 7, failedBatches: [] });
    expect(run.calls.map((call) => call.ids)).toEqual([
      ['i0', 'i1', 'i2'],
      ['i3', 'i4', 'i5'],
      ['i6'],
    ]);
    expect(run.calls.map((call) => call.argumentCount)).toEqual([2, 2, 2]);
    expect(run.calls.map((call) => call.signal)).toEqual([
      controller.signal,
      controller.signal,
      controller.signal,
    ]);
  });

  it('makes a single batch when batchSize exceeds the item count', async () => {
    const run = harness();
    const done = run.uploader.uploadAll(makeItems(2), options(10, 3));
    await waitForCalls(run.calls, 1);
    callAt(run.calls, 0).finish();
    expect(await done).toEqual({ kind: 'done', uploaded: 2, failedBatches: [] });
    expect(run.calls.map((call) => call.ids)).toEqual([['i0', 'i1']]);
  });

  it('makes no extra batch when the count divides evenly', async () => {
    const run = harness();
    const done = run.uploader.uploadAll(makeItems(4), options(2, 5));
    await waitForCalls(run.calls, 2);
    await settle();
    expect(run.calls).toHaveLength(2);
    for (const call of run.calls) {
      call.finish();
    }
    expect(await done).toEqual({ kind: 'done', uploaded: 4, failedBatches: [] });
  });
});

describe('concurrency', () => {
  it('starts batches in index order up to the limit and refills freed slots', async () => {
    const run = harness();
    const done = run.uploader.uploadAll(makeItems(5), options(1, 2));
    await waitForCalls(run.calls, 2);
    await settle();
    expect(run.calls.map((call) => call.ids)).toEqual([['i0'], ['i1']]);
    callAt(run.calls, 1).finish();
    await waitForCalls(run.calls, 3);
    await settle();
    expect(run.calls.map((call) => call.ids)).toEqual([['i0'], ['i1'], ['i2']]);
    callAt(run.calls, 2).finish();
    await waitForCalls(run.calls, 4);
    callAt(run.calls, 0).finish();
    await waitForCalls(run.calls, 5);
    callAt(run.calls, 3).finish();
    callAt(run.calls, 4).finish();
    expect(await done).toEqual({ kind: 'done', uploaded: 5, failedBatches: [] });
    expect(run.calls.map((call) => call.ids)).toEqual([['i0'], ['i1'], ['i2'], ['i3'], ['i4']]);
    expect(run.flight.peak).toBe(2);
  });

  it('starts every batch at once when the limit exceeds the batch count', async () => {
    const run = harness();
    const done = run.uploader.uploadAll(makeItems(3), options(1, 1_000_000_000));
    await waitForCalls(run.calls, 3);
    for (const call of run.calls) {
      call.finish();
    }
    expect(await done).toEqual({ kind: 'done', uploaded: 3, failedBatches: [] });
    expect(run.flight.peak).toBe(3);
  });

  it('keeps independent limits for two concurrent calls on one uploader', async () => {
    const run = harness();
    const first = run.uploader.uploadAll(makeItems(3), options(1, 1));
    const second = run.uploader.uploadAll(makeItems(3), options(1, 1));
    await waitForCalls(run.calls, 2);
    await settle();
    expect(run.calls).toHaveLength(2);
    expect(run.flight.peak).toBe(2);
    for (const round of [1, 2, 3]) {
      await waitForCalls(run.calls, 2 * round);
      for (const call of run.calls.slice(-2)) {
        call.finish();
      }
    }
    expect(await first).toEqual({ kind: 'done', uploaded: 3, failedBatches: [] });
    expect(await second).toEqual({ kind: 'done', uploaded: 3, failedBatches: [] });
  });

  it('handles many batches without exceeding the limit', async () => {
    const run = harness();
    const done = run.uploader.uploadAll(makeItems(40), options(2, 4));
    for (const step of Array.from({ length: 20 }, (_, index) => index)) {
      await waitForCalls(run.calls, Math.min(step + 4, 20));
      callAt(run.calls, step).finish();
    }
    expect(await done).toEqual({ kind: 'done', uploaded: 40, failedBatches: [] });
    expect(run.flight.peak).toBe(4);
    expect(run.calls.map((call) => call.ids[0])).toEqual(
      Array.from({ length: 20 }, (_, index) => `i${String(index * 2)}`),
    );
  });
});

describe('retry', () => {
  it('waits 1000 ms once and uploads the same batch again', async () => {
    const run = harness();
    const controller = new AbortController();
    const done = run.uploader.uploadAll(makeItems(2), options(2, 1, controller.signal));
    await waitForCalls(run.calls, 1);
    callAt(run.calls, 0).fail(new Error('first'));
    await waitForWaits(run.waits, 1);
    await settle();
    expect(run.calls).toHaveLength(1);
    expect(waitAt(run.waits, 0).ms).toBe(1000);
    waitAt(run.waits, 0).release();
    await waitForCalls(run.calls, 2);
    expect(callAt(run.calls, 1).ids).toEqual(['i0', 'i1']);
    expect(callAt(run.calls, 1).argumentCount).toBe(2);
    expect(callAt(run.calls, 1).signal).toBe(controller.signal);
    callAt(run.calls, 1).finish();
    expect(await done).toEqual({ kind: 'done', uploaded: 2, failedBatches: [] });
    expect(run.waits).toHaveLength(1);
    expect(run.clock.reads).toBe(0);
  });

  it('gives a batch up after a second rejection and records the second reason and time', async () => {
    const run = harness();
    const items = makeItems(2);
    const done = run.uploader.uploadAll(items, options(2, 1));
    run.clock.time = 111;
    await waitForCalls(run.calls, 1);
    callAt(run.calls, 0).fail(new Error('first'));
    await waitForWaits(run.waits, 1);
    run.clock.time = 222;
    waitAt(run.waits, 0).release();
    await waitForCalls(run.calls, 2);
    run.clock.time = 333;
    callAt(run.calls, 1).fail(new Error('second'));
    expect(await done).toEqual({
      kind: 'done',
      uploaded: 0,
      failedBatches: [{ index: 0, items, reason: 'second', failedAt: 333 }],
    });
    expect(run.calls).toHaveLength(2);
    expect(run.waits).toHaveLength(1);
    expect(run.clock.reads).toBe(1);
  });

  it.each([
    [42, '42'],
    ['plain text', 'plain text'],
    [undefined, 'undefined'],
    [{ code: 7 }, '[object Object]'],
  ])('describes the rejection value %j as %j', async (value, reason) => {
    const uploader = createBatchUploader({
      upload: vi.fn().mockRejectedValue(value),
      sleep: () => Promise.resolve(),
      now: () => 5,
    });
    expect(await uploader.uploadAll(makeItems(1), options(1, 1))).toEqual({
      kind: 'done',
      uploaded: 0,
      failedBatches: [{ index: 0, items: makeItems(1), reason, failedAt: 5 }],
    });
  });

  it('treats a synchronous throw as a rejection', async () => {
    const waits: number[] = [];
    const attempts: (readonly string[])[] = [];
    const uploader = createBatchUploader({
      upload(batch) {
        attempts.push(idsOf(batch));
        throw new Error('sync failure');
      },
      sleep(ms) {
        waits.push(ms);
        return Promise.resolve();
      },
      now: () => 9,
    });
    expect(await uploader.uploadAll(makeItems(1), options(1, 1))).toEqual({
      kind: 'done',
      uploaded: 0,
      failedBatches: [{ index: 0, items: makeItems(1), reason: 'sync failure', failedAt: 9 }],
    });
    expect(attempts).toEqual([['i0'], ['i0']]);
    expect(waits).toEqual([1000]);
  });

  it('lists failed batches by index and counts only uploaded items', async () => {
    const run = harness();
    const items = makeItems(5);
    const done = run.uploader.uploadAll(items, options(2, 3));
    await waitForCalls(run.calls, 3);
    callAt(run.calls, 2).fail(new Error('c'));
    callAt(run.calls, 1).fail(new Error('b'));
    callAt(run.calls, 0).finish();
    await waitForWaits(run.waits, 2);
    for (const wait of run.waits) {
      wait.release();
    }
    await waitForCalls(run.calls, 5);
    expect(run.calls.slice(3).map((call) => call.ids)).toEqual([['i4'], ['i2', 'i3']]);
    callAt(run.calls, 3).fail(new Error('c again'));
    callAt(run.calls, 4).fail(new Error('b again'));
    expect(await done).toEqual({
      kind: 'done',
      uploaded: 2,
      failedBatches: [
        { index: 1, items: items.slice(2, 4), reason: 'b again', failedAt: 0 },
        { index: 2, items: items.slice(4), reason: 'c again', failedAt: 0 },
      ],
    });
    expect(run.clock.reads).toBe(2);
  });

  it('keeps the slot of a batch that is waiting to retry', async () => {
    const run = harness();
    const done = run.uploader.uploadAll(makeItems(2), options(1, 1));
    await waitForCalls(run.calls, 1);
    callAt(run.calls, 0).fail(new Error('x'));
    await waitForWaits(run.waits, 1);
    await settle();
    expect(run.calls).toHaveLength(1);
    waitAt(run.waits, 0).release();
    await waitForCalls(run.calls, 2);
    await settle();
    expect(run.calls.map((call) => call.ids)).toEqual([['i0'], ['i0']]);
    callAt(run.calls, 1).finish();
    await waitForCalls(run.calls, 3);
    expect(callAt(run.calls, 2).ids).toEqual(['i1']);
    callAt(run.calls, 2).finish();
    expect(await done).toEqual({ kind: 'done', uploaded: 2, failedBatches: [] });
  });

  it('lets other slots keep working while one batch waits to retry', async () => {
    const run = harness();
    const done = run.uploader.uploadAll(makeItems(3), options(1, 2));
    await waitForCalls(run.calls, 2);
    callAt(run.calls, 0).fail(new Error('x'));
    await waitForWaits(run.waits, 1);
    callAt(run.calls, 1).finish();
    await waitForCalls(run.calls, 3);
    expect(callAt(run.calls, 2).ids).toEqual(['i2']);
    callAt(run.calls, 2).finish();
    waitAt(run.waits, 0).release();
    await waitForCalls(run.calls, 4);
    callAt(run.calls, 3).finish();
    expect(await done).toEqual({ kind: 'done', uploaded: 3, failedBatches: [] });
    expect(run.flight.peak).toBe(2);
  });
});

describe('abort', () => {
  it('starts nothing when the signal is already aborted', async () => {
    const run = harness();
    const controller = new AbortController();
    controller.abort();
    const items = makeItems(5);
    expect(await run.uploader.uploadAll(items, options(2, 2, controller.signal))).toEqual({
      kind: 'aborted',
      uploaded: 0,
      failedBatches: [],
      notStarted: items,
    });
    expect(run.calls).toHaveLength(0);
  });

  it('stops starting batches, lets started ones finish and lists the rest in order', async () => {
    const run = harness();
    const controller = new AbortController();
    const items = makeItems(9);
    const done = run.uploader.uploadAll(items, options(2, 2, controller.signal));
    await waitForCalls(run.calls, 2);
    controller.abort();
    callAt(run.calls, 1).finish();
    await settle();
    expect(await isPending(done)).toBe(true);
    callAt(run.calls, 0).finish();
    expect(await done).toEqual({
      kind: 'aborted',
      uploaded: 4,
      failedBatches: [],
      notStarted: items.slice(4),
    });
    expect(run.calls).toHaveLength(2);
  });

  it('retries a batch that was already running when the signal aborted', async () => {
    const run = harness();
    const controller = new AbortController();
    const items = makeItems(4);
    const done = run.uploader.uploadAll(items, options(2, 1, controller.signal));
    await waitForCalls(run.calls, 1);
    callAt(run.calls, 0).fail(new Error('x'));
    await waitForWaits(run.waits, 1);
    controller.abort();
    waitAt(run.waits, 0).release();
    await waitForCalls(run.calls, 2);
    expect(callAt(run.calls, 1).signal.aborted).toBe(true);
    callAt(run.calls, 1).finish();
    expect(await done).toEqual({
      kind: 'aborted',
      uploaded: 2,
      failedBatches: [],
      notStarted: items.slice(2),
    });
    expect(run.calls).toHaveLength(2);
  });

  it('reports a failed in-flight batch next to the batches never started', async () => {
    const run = harness();
    const controller = new AbortController();
    const items = makeItems(3);
    const done = run.uploader.uploadAll(items, options(1, 1, controller.signal));
    await waitForCalls(run.calls, 1);
    controller.abort();
    callAt(run.calls, 0).fail(new Error('a'));
    await waitForWaits(run.waits, 1);
    run.clock.time = 5;
    waitAt(run.waits, 0).release();
    await waitForCalls(run.calls, 2);
    callAt(run.calls, 1).fail(new Error('b'));
    expect(await done).toEqual({
      kind: 'aborted',
      uploaded: 0,
      failedBatches: [{ index: 0, items: items.slice(0, 1), reason: 'b', failedAt: 5 }],
      notStarted: items.slice(1),
    });
  });

  it('is done, not aborted, when every batch had started before the signal aborted', async () => {
    const run = harness();
    const controller = new AbortController();
    const done = run.uploader.uploadAll(makeItems(4), options(2, 2, controller.signal));
    await waitForCalls(run.calls, 2);
    controller.abort();
    for (const call of run.calls) {
      call.finish();
    }
    expect(await done).toEqual({ kind: 'done', uploaded: 4, failedBatches: [] });
  });

  it('checks the signal before each start, so a late abort leaves only the last batches', async () => {
    const run = harness();
    const controller = new AbortController();
    const items = makeItems(4);
    const done = run.uploader.uploadAll(items, options(1, 1, controller.signal));
    await waitForCalls(run.calls, 1);
    callAt(run.calls, 0).finish();
    await waitForCalls(run.calls, 2);
    controller.abort();
    callAt(run.calls, 1).finish();
    expect(await done).toEqual({
      kind: 'aborted',
      uploaded: 2,
      failedBatches: [],
      notStarted: items.slice(2),
    });
  });
});
