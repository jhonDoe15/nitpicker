import { runGreeting } from './features/greeting/index.js';
import { describePrice, fetchPrices } from './features/prices/index.js';

const QUOTE_URL = 'https://prices.example.com/quotes/';
const DEFAULT_OPTIONS = { maxAttempts: 3, baseDelayMs: 500 };

export function main(names: readonly string[]): void {
  runGreeting(names, { write: (text) => process.stdout.write(text) });
}

async function fetchQuote(symbol: string): Promise<{ status: number; body: string }> {
  const response = await fetch(`${QUOTE_URL}${encodeURIComponent(symbol)}`);
  return { status: response.status, body: await response.text() };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function pricesMain(symbols: readonly string[]): Promise<void> {
  const results = await fetchPrices(symbols, {
    fetcher: fetchQuote,
    sleep,
    options: DEFAULT_OPTIONS,
  });
  for (const result of results) {
    process.stdout.write(`${describePrice(result)}\n`);
  }
}
