export type Item = { readonly id: string };

export type Batch = { readonly index: number; readonly items: readonly Item[] };

export type BatchOutcome =
  | { readonly kind: 'uploaded'; readonly items: readonly Item[] }
  | {
      readonly kind: 'failed';
      readonly items: readonly Item[];
      readonly reason: string;
      readonly failedAt: number;
    }
  | { readonly kind: 'not-started'; readonly items: readonly Item[] };

export type FinishedBatch = { readonly index: number; readonly outcome: BatchOutcome };

type FailedBatch = {
  readonly index: number;
  readonly items: readonly Item[];
  readonly reason: string;
  readonly failedAt: number;
};

export type UploadSummary =
  | {
      readonly kind: 'done';
      readonly uploaded: number;
      readonly failedBatches: readonly FailedBatch[];
    }
  | {
      readonly kind: 'aborted';
      readonly uploaded: number;
      readonly failedBatches: readonly FailedBatch[];
      readonly notStarted: readonly Item[];
    };

export type OptionsVerdict =
  | { readonly kind: 'valid' }
  | { readonly kind: 'invalid'; readonly field: 'batchSize' | 'concurrency' };

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function checkOptions(options: {
  readonly batchSize: number;
  readonly concurrency: number;
}): OptionsVerdict {
  if (!isPositiveInteger(options.batchSize)) {
    return { kind: 'invalid', field: 'batchSize' };
  }
  if (!isPositiveInteger(options.concurrency)) {
    return { kind: 'invalid', field: 'concurrency' };
  }
  return { kind: 'valid' };
}

export function splitIntoBatches(items: readonly Item[], batchSize: number): readonly Batch[] {
  return Array.from({ length: Math.ceil(items.length / batchSize) }, (_, index): Batch => ({
    index,
    items: items.slice(index * batchSize, (index + 1) * batchSize),
  }));
}

export function workerCount(concurrency: number, batchCount: number): number {
  return Math.min(concurrency, batchCount);
}

export function summarize(
  batches: readonly Batch[],
  finished: readonly FinishedBatch[],
): UploadSummary {
  const byIndex: ReadonlyMap<number, BatchOutcome> = new Map(
    finished.map((entry): readonly [number, BatchOutcome] => [entry.index, entry.outcome]),
  );
  const outcomes: readonly BatchOutcome[] = batches.map(
    (batch): BatchOutcome =>
      byIndex.get(batch.index) ?? { kind: 'not-started', items: batch.items },
  );
  const uploaded = outcomes.reduce(
    (sum, outcome) => (outcome.kind === 'uploaded' ? sum + outcome.items.length : sum),
    0,
  );
  const failedBatches: readonly FailedBatch[] = outcomes.flatMap(
    (outcome, index): readonly FailedBatch[] =>
      outcome.kind === 'failed'
        ? [{ index, items: outcome.items, reason: outcome.reason, failedAt: outcome.failedAt }]
        : [],
  );
  const notStarted: readonly Item[] = outcomes.flatMap((outcome): readonly Item[] =>
    outcome.kind === 'not-started' ? outcome.items : [],
  );
  if (notStarted.length === 0) {
    return { kind: 'done', uploaded, failedBatches };
  }
  return { kind: 'aborted', uploaded, failedBatches, notStarted };
}
