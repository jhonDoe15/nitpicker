import { formatMoney } from '../domain/format-money.js';
import type { Split, SplitFailure } from '../domain/split-bill.js';

export type Writer = { readonly write: (text: string) => void };

export function formatShares(split: Split | SplitFailure, writer: Writer): void {
  if ('failure' in split) {
    writer.write('Nobody to split between\n');
    return;
  }
  const width = split.shares
    .map((share) => share.name.length)
    .reduce((longest, length) => (length > longest ? length : longest));
  for (const share of split.shares) {
    writer.write(share.name.padEnd(width) + '  ' + formatMoney(share.cents) + '\n');
  }
  writer.write('Total: ' + formatMoney(split.totalCents) + '\n');
}
