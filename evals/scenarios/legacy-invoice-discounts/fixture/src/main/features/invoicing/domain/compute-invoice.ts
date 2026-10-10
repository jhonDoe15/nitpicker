import { formatMoney } from './format-money.js';
import { TaxCalculator } from './tax-calculator.js';

// Invoice totals. Money is integer cents everywhere.
export interface InvoiceResult {
  lines: string[];
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
}

const FREE_SHIPPING_FROM_CENTS = 10000;
const FLAT_SHIPPING_CENTS = 599;
const HEAVY_SHIPPING_CENTS = 1299;
const HEAVY_GRAMS = 5000;

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

  // shipping is free for pickup and for big orders
  let shipping = 0;
  if (order.pickup) {
    shipping = 0;
  } else {
    if (subtotal >= FREE_SHIPPING_FROM_CENTS) {
      shipping = 0;
    } else {
      if (grams > HEAVY_GRAMS) {
        shipping = HEAVY_SHIPPING_CENTS;
      } else {
        shipping = FLAT_SHIPPING_CENTS;
      }
    }
  }
  if (shipping === 0) {
    lines.push('Shipping: FREE');
  } else {
    lines.push('Shipping: ' + formatMoney(shipping));
  }

  let tax = 0;
  if (order.customer && order.customer.taxExempt) {
    lines.push('Tax: exempt');
  } else {
    const calc = new TaxCalculator(order.customer ? order.customer.country : '');
    tax = calc.taxFor(subtotal);
    lines.push('Tax (' + Math.round(calc.rate() * 100) + '%): ' + formatMoney(tax));
  }

  const total = subtotal + shipping + tax;
  lines.push('Total: ' + formatMoney(total));

  return {
    lines: lines,
    subtotalCents: subtotal,
    shippingCents: shipping,
    taxCents: tax,
    totalCents: total,
  };
}
