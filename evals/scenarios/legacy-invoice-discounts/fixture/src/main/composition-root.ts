import { printInvoice } from './features/invoicing/index.js';

export function main(order: Parameters<typeof printInvoice>[0]): void {
  printInvoice(order, { write: (text) => process.stdout.write(text) });
}
