import type { OrderStatus } from '../../orders/index.js';
import { formatMoney } from './format-money.js';

export type Invoice = {
  readonly number: string;
  readonly orderStatus: OrderStatus;
  readonly amountCents: number;
};

function invoiceLabel(status: OrderStatus): string {
  switch (status) {
    case 'pending':
      return 'OPEN';
    case 'paid':
      return 'BILLED';
    case 'shipped':
      return 'SETTLED';
    case 'cancelled':
      return 'VOID';
  }
}

function dueCents(invoice: Invoice): number {
  switch (invoice.orderStatus) {
    case 'pending':
    case 'paid':
      return invoice.amountCents;
    case 'shipped':
    case 'cancelled':
      return 0;
  }
}

export function statementLine(invoice: Invoice): string {
  return `${invoice.number} [${invoiceLabel(invoice.orderStatus)}] ${formatMoney(invoice.amountCents)}`;
}

export function dueTotalCents(invoices: readonly Invoice[]): number {
  return invoices.reduce((sum, invoice) => sum + dueCents(invoice), 0);
}
