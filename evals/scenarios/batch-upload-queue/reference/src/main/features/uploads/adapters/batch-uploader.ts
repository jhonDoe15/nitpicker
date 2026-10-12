import {
  checkOptions,
  splitIntoBatches,
  summarize,
  workerCount,
  type Batch,
  type BatchOutcome,
  type FinishedBatch,
  type Item,
  type UploadSummary,
} from '../domain/batches.js';

const RETRY_DELAY_MS = 1000;

type UploadDeps = {
  readonly upload: (batch: readonly Item[], signal: AbortSignal) => Promise<void>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
};

type UploadOptions = {
  readonly batchSize: number;
  readonly concurrency: number;
  readonly signal: AbortSignal;
};

type RunContext = { readonly deps: UploadDeps; readonly signal: AbortSignal };

type Attempt = { readonly kind: 'ok' } | { readonly kind: 'rejected'; readonly reason: string };

function describeRejection(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function attemptUpload(items: readonly Item[], run: RunContext): Promise<Attempt> {
  try {
    await run.deps.upload(items, run.signal);
    return { kind: 'ok' };
  } catch (error) {
    return { kind: 'rejected', reason: describeRejection(error) };
  }
}

async function runBatch(items: readonly Item[], run: RunContext): Promise<BatchOutcome> {
  const first = await attemptUpload(items, run);
  if (first.kind === 'ok') {
    return { kind: 'uploaded', items };
  }
  await run.deps.sleep(RETRY_DELAY_MS);
  const second = await attemptUpload(items, run);
  if (second.kind === 'ok') {
    return { kind: 'uploaded', items };
  }
  return { kind: 'failed', items, reason: second.reason, failedAt: run.deps.now() };
}

async function runWorker(
  pending: Iterable<Batch>,
  run: RunContext,
): Promise<readonly FinishedBatch[]> {
  const finished: FinishedBatch[] = [];
  for (const batch of pending) {
    if (run.signal.aborted) {
      return finished;
    }
    finished.push({ index: batch.index, outcome: await runBatch(batch.items, run) });
  }
  return finished;
}

export function createBatchUploader(deps: UploadDeps) {
  async function uploadAll(items: readonly Item[], options: UploadOptions): Promise<UploadSummary> {
    const verdict = checkOptions(options);
    if (verdict.kind === 'invalid') {
      throw new RangeError(`${verdict.field} must be a positive integer`);
    }
    const batches = splitIntoBatches(items, options.batchSize);
    const pending = batches.values();
    const run = { deps, signal: options.signal };
    const workers = Array.from({ length: workerCount(options.concurrency, batches.length) }, () =>
      runWorker(pending, run),
    );
    const finished = await Promise.all(workers);
    return summarize(batches, finished.flat());
  }

  return { uploadAll };
}
