import { orderTotalCents } from './order.js';
import type { Order } from './order.js';

interface EmailDelivery {
  channel: 'email';
  to: string;
  subject: string;
  body: string;
}

interface SmsDelivery {
  channel: 'sms';
  to: string;
  text: string;
}

type Delivery = EmailDelivery | SmsDelivery;

interface OrderUser {
  name: string;
  email: string;
  phone?: string;
  preferredChannel: 'email' | 'sms';
  utcOffsetMinutes: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// the old mailer printed the UTC day
function formatDay(iso: string): string {
  const d = new Date(iso);
  return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

function money(cents: number): string {
  const whole = Math.floor(cents / 100);
  let rest = String(cents % 100);
  if (rest.length < 2) {
    rest = '0' + rest;
  }
  return '$' + whole + '.' + rest;
}

// sms only when the customer asked for it and left a usable number
function wantsSms(user: OrderUser): boolean {
  if (user.preferredChannel !== 'sms') {
    return false;
  }
  if (user.phone && user.phone.trim() !== '') {
    return true;
  }
  return false;
}

export function orderReceipt(order: Order, user: OrderUser, now: string): Delivery {
  const heading = 'Order #' + order.id;
  const lines: string[] = [];
  order.lines.forEach(function (line) {
    lines.push(
      line.quantity +
        ' x ' +
        line.name +
        ' @ ' +
        money(line.unitCents) +
        ' = ' +
        money(line.quantity * line.unitCents),
    );
  });
  lines.push('Shipping: ' + money(order.shippingCents));
  lines.push('Placed on ' + formatDay(order.placedAt));
  const total = money(orderTotalCents(order));
  if (wantsSms(user)) {
    return {
      channel: 'sms',
      to: user.phone as string,
      text: heading + ': total ' + total + ' (' + formatDay(now) + ')',
    };
  }
  return {
    channel: 'email',
    to: user.email,
    subject: 'Receipt: ' + heading,
    body:
      'Hi ' +
      user.name +
      ',\n\n' +
      lines.join('\n') +
      '\n\nTotal: ' +
      total +
      '\nIssued ' +
      formatDay(now) +
      '\n',
  };
}

export function orderReminder(order: Order, user: OrderUser, now: string): Delivery {
  const heading = 'Order #' + order.id + ' awaiting payment';
  const text = 'Please pay ' + money(orderTotalCents(order)) + ' to keep your order.';
  if (wantsSms(user)) {
    return {
      channel: 'sms',
      to: user.phone as string,
      text: heading + ': ' + text + ' (due ' + formatDay(order.payBy) + ')',
    };
  }
  return {
    channel: 'email',
    to: user.email,
    subject: 'Reminder: ' + heading,
    body:
      'Hi ' +
      user.name +
      ',\n\n' +
      text +
      '\n\nDue ' +
      formatDay(order.payBy) +
      '\nSent ' +
      formatDay(now) +
      '\n',
  };
}
