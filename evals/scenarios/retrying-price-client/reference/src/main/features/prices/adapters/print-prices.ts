import { describePrice } from '../domain/describe-price.js';
import type { PriceResult } from '../domain/policy.js';

export function printPrices(
  results: readonly PriceResult[],
  writer: { readonly write: (text: string) => void },
): void {
  for (const result of results) {
    writer.write(`${describePrice(result)}\n`);
  }
}
