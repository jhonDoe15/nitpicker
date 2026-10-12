import { dueTotalCents, statementLine } from '../domain/invoice.js';
import type { Invoice } from '../domain/invoice.js';
import { formatMoney } from '../domain/format-money.js';

type Writer = { readonly write: (text: string) => void };

export function printStatement(invoices: readonly Invoice[], writer: Writer): void {
  for (const invoice of invoices) {
    writer.write(`${statementLine(invoice)}\n`);
  }
  writer.write(`Due: ${formatMoney(dueTotalCents(invoices))}\n`);
}
