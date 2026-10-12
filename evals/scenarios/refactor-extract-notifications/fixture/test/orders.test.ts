import { describe, expect, it } from 'vitest';
import { orderReceipt, orderReminder } from '../src/main/features/orders/index.js';

const order: Parameters<typeof orderReceipt>[0] = {
  id: '1001',
  placedAt: '2026-03-05T10:00:00Z',
  payBy: '2026-03-12T12:00:00Z',
  shippingCents: 399,
  lines: [
    { name: 'Notebook', quantity: 2, unitCents: 450 },
    { name: 'Pen set', quantity: 1, unitCents: 1200 },
  ],
};

type Customer = Parameters<typeof orderReceipt>[1];

const emailCustomer: Customer = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  preferredChannel: 'email',
  utcOffsetMinutes: 0,
};

const smsCustomer: Customer = {
  name: 'Grace Hopper',
  email: 'grace@example.com',
  phone: '+15550100',
  preferredChannel: 'sms',
  utcOffsetMinutes: 120,
};

const noPhoneCustomer: Customer = {
  name: 'Alan Turing',
  email: 'alan@example.com',
  preferredChannel: 'sms',
  utcOffsetMinutes: -300,
};

const now = '2026-03-08T09:00:00Z';

describe('orderReceipt', () => {
  it('emails an itemised receipt', () => {
    expect(orderReceipt(order, emailCustomer, now)).toEqual({
      channel: 'email',
      to: 'ada@example.com',
      subject: 'Receipt: Order #1001',
      body: 'Hi Ada Lovelace,\n\n2 x Notebook @ $4.50 = $9.00\n1 x Pen set @ $12.00 = $12.00\nShipping: $3.99\nPlaced on 5 Mar 2026\n\nTotal: $24.99\nIssued 8 Mar 2026\n',
    });
  });

  it('texts a one-line receipt to a customer who prefers sms', () => {
    expect(orderReceipt(order, smsCustomer, now)).toEqual({
      channel: 'sms',
      to: '+15550100',
      text: 'Order #1001: total $24.99 (8 Mar 2026)',
    });
  });

  it('falls back to email when the customer prefers sms but left no phone', () => {
    expect(orderReceipt(order, noPhoneCustomer, now)).toEqual({
      channel: 'email',
      to: 'alan@example.com',
      subject: 'Receipt: Order #1001',
      body: 'Hi Alan Turing,\n\n2 x Notebook @ $4.50 = $9.00\n1 x Pen set @ $12.00 = $12.00\nShipping: $3.99\nPlaced on 5 Mar 2026\n\nTotal: $24.99\nIssued 8 Mar 2026\n',
    });
  });

  it('pads single-digit cents', () => {
    const cheap = {
      ...order,
      shippingCents: 0,
      lines: [{ name: 'Clip', quantity: 3, unitCents: 105 }],
    };
    expect(orderReceipt(cheap, smsCustomer, now)).toEqual({
      channel: 'sms',
      to: '+15550100',
      text: 'Order #1001: total $3.15 (8 Mar 2026)',
    });
  });
});

describe('orderReminder', () => {
  it('emails a payment reminder', () => {
    expect(orderReminder(order, emailCustomer, now)).toEqual({
      channel: 'email',
      to: 'ada@example.com',
      subject: 'Reminder: Order #1001 awaiting payment',
      body: 'Hi Ada Lovelace,\n\nPlease pay $24.99 to keep your order.\n\nDue 12 Mar 2026\nSent 8 Mar 2026\n',
    });
  });

  it('texts a payment reminder', () => {
    expect(orderReminder(order, smsCustomer, now)).toEqual({
      channel: 'sms',
      to: '+15550100',
      text: 'Order #1001 awaiting payment: Please pay $24.99 to keep your order. (due 12 Mar 2026)',
    });
  });
});
