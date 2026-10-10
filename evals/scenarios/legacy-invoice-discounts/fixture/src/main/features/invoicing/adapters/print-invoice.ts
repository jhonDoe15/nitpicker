import { computeInvoice } from '../domain/compute-invoice.js';

export type Writer = { readonly write: (text: string) => void };

export function printInvoice(order: Parameters<typeof computeInvoice>[0], writer: Writer): void {
  const invoice = computeInvoice(order);
  for (const line of invoice.lines) {
    writer.write(`${line}\n`);
  }
}
