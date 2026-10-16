import { formatMoney } from './format-money.js';
import { finishInvoice } from './invoice-tail.js';
import { readInvoiceOptions } from './invoice-options.js';

// Invoice totals. Money is integer cents everywhere.
export type InvoiceResult = {
  readonly lines: readonly string[];
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly shippingCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
};

export function computeInvoice(order: any): InvoiceResult {
  if (!order || !order.items || order.items.length === 0) {
    throw new Error('Invoice has no items');
  }
  const lines: string[] = [];
  let subtotal = 0;
  let grams = 0;
  for (let i = 0; i < order.items.length; i++) {
    const item = order.items[i];
    if (item.qty <= 0 || item.qty % 1 !== 0) {
      throw new Error('Invalid quantity for ' + item.name);
    }
    const lineTotal = item.qty * item.unitCents;
    subtotal += lineTotal;
    grams += (item.grams || 0) * item.qty;
    lines.push(
      item.qty +
        ' x ' +
        item.name +
        ' @ ' +
        formatMoney(item.unitCents) +
        ' = ' +
        formatMoney(lineTotal),
    );
  }
  lines.push('Subtotal: ' + formatMoney(subtotal));
  const tail = finishInvoice(readInvoiceOptions(order), subtotal, grams);

  return {
    lines: [...lines, ...tail.lines],
    subtotalCents: subtotal,
    discountCents: tail.discountCents,
    shippingCents: tail.shippingCents,
    taxCents: tail.taxCents,
    totalCents: tail.totalCents,
  };
}
