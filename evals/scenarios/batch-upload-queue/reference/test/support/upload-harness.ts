import { vi } from 'vitest';
import { createBatchUploader } from '../../src/main/features/uploads/index.js';

export type Deps = Parameters<typeof createBatchUploader>[0];
export type Item = Parameters<Deps['upload']>[0][number];

export type Call = {
  readonly ids: readonly string[];
  readonly argumentCount: number;
  readonly signal: AbortSignal;
  readonly finish: () => void;
  readonly fail: (error: Error) => void;
};

export type Wait = { readonly ms: number; readonly release: () => void };

const PENDING = Symbol('pending');
const SETTLE_TICKS = Array.from({ length: 40 }, (_, tick) => tick);

export function makeItems(count: number): readonly Item[] {
  return Array.from({ length: count }, (_, index) => ({ id: `i${String(index)}` }));
}

export function idsOf(items: readonly Item[]): readonly string[] {
  return items.map((item) => item.id);
}

export async function settle(): Promise<void> {
  for (const tick of SETTLE_TICKS) {
    await Promise.resolve(tick);
  }
}

export function harness() {
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

export function callAt(calls: readonly Call[], index: number): Call {
  const call = calls.at(index);
  if (call === undefined) {
    throw new Error(`no upload call ${String(index)}`);
  }
  return call;
}

export function waitAt(waits: readonly Wait[], index: number): Wait {
  const wait = waits.at(index);
  if (wait === undefined) {
    throw new Error(`no sleep call ${String(index)}`);
  }
  return wait;
}

async function waitForLength(list: readonly unknown[], count: number, what: string): Promise<void> {
  await vi.waitFor(() => {
    if (list.length !== count) {
      throw new Error(`expected ${String(count)} ${what}, saw ${String(list.length)}`);
    }
  });
}

export async function waitForCalls(calls: readonly Call[], count: number): Promise<void> {
  await waitForLength(calls, count, 'upload calls');
}

export async function waitForWaits(waits: readonly Wait[], count: number): Promise<void> {
  await waitForLength(waits, count, 'sleep calls');
}

export function options(
  batchSize: number,
  concurrency: number,
  signal = new AbortController().signal,
) {
  return { batchSize, concurrency, signal };
}

export async function isPending(promise: Promise<unknown>): Promise<boolean> {
  return (await Promise.race([promise, Promise.resolve(PENDING)])) === PENDING;
}
