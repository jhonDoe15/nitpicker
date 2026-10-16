import { describe, expect, it, vi } from 'vitest';
import { createBatchUploader } from '../src/main/features/uploads/index.js';
import {
  callAt,
  harness,
  idsOf,
  isPending,
  makeItems,
  options,
  settle,
  waitAt,
  waitForCalls,
  waitForWaits,
} from './support/upload-harness.js';

describe('retry', () => {
  it('waits 1000 ms once and uploads the same batch again', async () => {
    const run = harness(createBatchUploader);
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
    const run = harness(createBatchUploader);
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
    const run = harness(createBatchUploader);
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
    const run = harness(createBatchUploader);
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
    const run = harness(createBatchUploader);
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
    const run = harness(createBatchUploader);
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
    const run = harness(createBatchUploader);
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
    const run = harness(createBatchUploader);
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
    const run = harness(createBatchUploader);
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
    const run = harness(createBatchUploader);
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
    const run = harness(createBatchUploader);
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
