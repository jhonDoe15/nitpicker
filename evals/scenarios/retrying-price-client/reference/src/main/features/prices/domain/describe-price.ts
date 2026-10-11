import type { PriceResult } from './policy.js';

function formatCents(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `${String(dollars)}.${String(remainder).padStart(2, '0')}`;
}

export function describePrice(result: PriceResult): string {
  switch (result.kind) {
    case 'ok':
      return `${result.symbol} ${formatCents(result.cents)}`;
    case 'failed':
      return `${result.symbol} failed: ${result.reason}`;
  }
}
