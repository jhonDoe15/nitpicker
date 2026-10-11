import {
  attemptNumbers,
  classifyStatus,
  rejectionVerdict,
  retryDelayMs,
  toResult,
  type PriceResult,
  type Verdict,
} from '../domain/policy.js';
import { parsePrice } from './parse-price.js';

type Reply = { readonly status: number; readonly body: string };

type PriceDeps = {
  readonly fetcher: (symbol: string) => Promise<Reply>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly options: { readonly maxAttempts: number; readonly baseDelayMs: number };
};

async function attemptOnce(symbol: string, fetcher: PriceDeps['fetcher']): Promise<Verdict> {
  let reply: Reply;
  try {
    reply = await fetcher(symbol);
  } catch (cause) {
    return rejectionVerdict(cause);
  }
  const verdict = classifyStatus(reply.status);
  if (verdict.kind === 'read-body') {
    return parsePrice(reply.body);
  }
  return verdict;
}

async function fetchOne(symbol: string, deps: PriceDeps): Promise<PriceResult> {
  for (const attempt of attemptNumbers(deps.options.maxAttempts - 1)) {
    const verdict = await attemptOnce(symbol, deps.fetcher);
    if (verdict.kind !== 'retry') {
      return toResult(symbol, verdict);
    }
    await deps.sleep(retryDelayMs(attempt, deps.options.baseDelayMs));
  }
  return toResult(symbol, await attemptOnce(symbol, deps.fetcher));
}

export async function fetchPrices(
  symbols: readonly string[],
  deps: PriceDeps,
): Promise<readonly PriceResult[]> {
  return Promise.all(symbols.map((symbol) => fetchOne(symbol, deps)));
}
