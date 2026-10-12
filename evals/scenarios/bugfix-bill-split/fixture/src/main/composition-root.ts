import { formatShares, splitBill } from './features/billing/index.js';

export function main(totalCents: number, people: readonly string[]): void {
  formatShares(splitBill(totalCents, people), { write: (text) => process.stdout.write(text) });
}
