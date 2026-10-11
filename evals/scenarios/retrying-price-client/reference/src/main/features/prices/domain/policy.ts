type FailureReason = 'not-found' | 'rate-limited' | 'server-error' | 'network' | 'bad-body';

export type Verdict =
  | { readonly kind: 'ok'; readonly cents: number }
  | { readonly kind: 'retry'; readonly reason: FailureReason; readonly cause?: unknown }
  | { readonly kind: 'failed'; readonly reason: FailureReason };

export type StatusVerdict = Verdict | { readonly kind: 'read-body' };

export type PriceResult =
  | { readonly kind: 'ok'; readonly symbol: string; readonly cents: number }
  | { readonly kind: 'failed'; readonly symbol: string; readonly reason: FailureReason };

export function classifyStatus(status: number): StatusVerdict {
  if (status >= 200 && status < 300) {
    return { kind: 'read-body' };
  }
  if (status === 429) {
    return { kind: 'retry', reason: 'rate-limited' };
  }
  if (status >= 400 && status < 500) {
    return { kind: 'failed', reason: 'not-found' };
  }
  if (status >= 500 && status < 600) {
    return { kind: 'retry', reason: 'server-error' };
  }
  return { kind: 'failed', reason: 'server-error' };
}

export function rejectionVerdict(cause: unknown): Verdict {
  return { kind: 'retry', reason: 'network', cause };
}

export function retryDelayMs(attempt: number, baseDelayMs: number): number {
  return baseDelayMs * 2 ** (attempt - 1);
}

export function attemptNumbers(count: number): readonly number[] {
  return Array.from({ length: count }, (_, index) => index + 1);
}

export function toResult(symbol: string, verdict: Verdict): PriceResult {
  switch (verdict.kind) {
    case 'ok':
      return { kind: 'ok', symbol, cents: verdict.cents };
    case 'retry':
    case 'failed':
      return { kind: 'failed', symbol, reason: verdict.reason };
  }
}
