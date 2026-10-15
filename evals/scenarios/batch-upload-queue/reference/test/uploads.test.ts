import { describe, expect, it } from 'vitest';
import {
  makeItems,
  settle,
  harness,
  callAt,
  waitForCalls,
  options,
} from './support/upload-harness.js';

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
