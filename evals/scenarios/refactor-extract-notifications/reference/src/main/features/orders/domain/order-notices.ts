import {
  formatDate,
  formatMoney,
  receiptMessage,
  reminderMessage,
} from '../../notifications/index.js';
import type { Message, Recipient } from '../../notifications/index.js';
import { orderTotalCents } from './order.js';
import type { Order } from './order.js';

export function orderReceipt(order: Order, customer: Recipient, now: string): Message {
  const items: readonly string[] = order.lines.map((line) => {
    const lineCents = formatMoney(line.quantity * line.unitCents);
    return `${String(line.quantity)} x ${line.name} @ ${formatMoney(line.unitCents)} = ${lineCents}`;
  });
  return receiptMessage({
    recipient: customer,
    now,
    heading: `Order #${order.id}`,
    lines: [
      ...items,
      `Shipping: ${formatMoney(order.shippingCents)}`,
      `Placed on ${formatDate(order.placedAt, customer.utcOffsetMinutes)}`,
    ],
    totalCents: orderTotalCents(order),
  });
}

export function orderReminder(order: Order, customer: Recipient, now: string): Message {
  return reminderMessage({
    recipient: customer,
    now,
    heading: `Order #${order.id} awaiting payment`,
    text: `Please pay ${formatMoney(orderTotalCents(order))} to keep your order.`,
    dueAt: order.payBy,
  });
}
