import { applyDiscountCodes } from './discount.js';
import { formatMoney } from './format-money.js';
import type { InvoiceOptions } from './invoice-options.js';
import { taxFor, taxRateFor } from './tax-calculator.js';

const FREE_SHIPPING_FROM_CENTS = 10000;
const FLAT_SHIPPING_CENTS = 599;
const HEAVY_SHIPPING_CENTS = 1299;
const HEAVY_GRAMS = 5000;

export type InvoiceTail = {
  readonly lines: readonly string[];
  readonly discountCents: number;
  readonly shippingCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
};

type TaxOutcome = { readonly cents: number; readonly line: string };

function shippingFor(options: InvoiceOptions, subtotalCents: number, grams: number): number {
  if (options.pickup || subtotalCents >= FREE_SHIPPING_FROM_CENTS) {
    return 0;
  }
  return grams > HEAVY_GRAMS ? HEAVY_SHIPPING_CENTS : FLAT_SHIPPING_CENTS;
}

function shippingLine(shippingCents: number): string {
  return shippingCents === 0 ? 'Shipping: FREE' : `Shipping: ${formatMoney(shippingCents)}`;
}

function taxOutcome(options: InvoiceOptions, taxableCents: number): TaxOutcome {
  if (options.taxExempt) {
    return { cents: 0, line: 'Tax: exempt' };
  }
  const cents = taxFor(taxableCents, options.country);
  const percent = String(Math.round(taxRateFor(options.country) * 100));
  return { cents, line: `Tax (${percent}%): ${formatMoney(cents)}` };
}

export function finishInvoice(
  options: InvoiceOptions,
  subtotalCents: number,
  grams: number,
): InvoiceTail {
  const discount = applyDiscountCodes(options.discountCodes, subtotalCents);
  const shippingCents = shippingFor(options, subtotalCents, grams);
  const tax = taxOutcome(options, subtotalCents - discount.discountCents);
  const totalCents = subtotalCents - discount.discountCents + shippingCents + tax.cents;
  return {
    lines: [
      ...discount.lines,
      shippingLine(shippingCents),
      tax.line,
      `Total: ${formatMoney(totalCents)}`,
    ],
    discountCents: discount.discountCents,
    shippingCents,
    taxCents: tax.cents,
    totalCents,
  };
}
