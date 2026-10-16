import { printStatement } from './features/invoicing/index.js';
import type { Invoice } from './features/invoicing/index.js';
import { statusLabel } from './features/orders/index.js';
import type { Order } from './features/orders/index.js';
import { summarizeShipping } from './features/shipping/index.js';
export { placeOnHold, releaseFromHold } from './features/orders/index.js';

const orders: readonly Order[] = [
  { id: 'O-1', status: 'pending', totalCents: 2500 },
  { id: 'O-2', status: 'paid', totalCents: 1999 },
  { id: 'O-3', status: 'shipped', totalCents: 12050 },
  { id: 'O-4', status: 'cancelled', totalCents: 800 },
];

const invoices: readonly Invoice[] = [
  { number: 'INV-1', orderStatus: 'pending', amountCents: 2500 },
  { number: 'INV-2', orderStatus: 'paid', amountCents: 1999 },
  { number: 'INV-3', orderStatus: 'shipped', amountCents: 12050 },
  { number: 'INV-4', orderStatus: 'cancelled', amountCents: 800 },
];

export function dailyReportMain(date: string): void {
  const writer = { write: (text: string) => process.stdout.write(text) };
  for (const order of orders) {
    writer.write(`${order.id}: ${statusLabel(order.status)}\n`);
  }
  writer.write(`${summarizeShipping(orders, date)}\n`);
  printStatement(invoices, writer);
}
