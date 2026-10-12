import { describe, expect, it } from 'vitest';
import {
  chooseChannel,
  formatDate,
  formatMoney,
  receiptMessage,
  reminderMessage,
} from '../src/main/features/notifications/index.js';
import type { Recipient } from '../src/main/features/notifications/index.js';
import { orderReceipt } from '../src/main/features/orders/index.js';
import { subscriptionReminder } from '../src/main/features/subscriptions/index.js';

const emailUser: Recipient = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  preferredChannel: 'email',
  utcOffsetMinutes: 0,
};

const smsUser: Recipient = {
  name: 'Grace Hopper',
  email: 'grace@example.com',
  phone: '+15550100',
  preferredChannel: 'sms',
  utcOffsetMinutes: 0,
};

const withoutUsablePhone: readonly (readonly [string, Recipient])[] = [
  [
    'no phone',
    {
      name: 'Grace Hopper',
      email: 'grace@example.com',
      preferredChannel: 'sms',
      utcOffsetMinutes: 0,
    },
  ],
  ['an empty phone', { ...smsUser, phone: '' }],
  ['a blank phone', { ...smsUser, phone: '   ' }],
];

const noon = '2026-03-08T12:00:00Z';

describe('formatDate', () => {
  it.each([
    ['2026-01-05T10:00:00Z', 0, '5 Jan 2026'],
    ['2026-02-28T10:00:00Z', 0, '28 Feb 2026'],
    ['2026-03-31T10:00:00Z', 0, '31 Mar 2026'],
    ['2026-04-01T10:00:00Z', 0, '1 Apr 2026'],
    ['2026-05-09T10:00:00Z', 0, '9 May 2026'],
    ['2026-06-10T10:00:00Z', 0, '10 Jun 2026'],
    ['2026-07-11T10:00:00Z', 0, '11 Jul 2026'],
    ['2026-08-12T10:00:00Z', 0, '12 Aug 2026'],
    ['2026-09-13T10:00:00Z', 0, '13 Sep 2026'],
    ['2026-10-14T10:00:00Z', 0, '14 Oct 2026'],
    ['2026-11-15T10:00:00Z', 0, '15 Nov 2026'],
    ['2026-12-16T10:00:00Z', 0, '16 Dec 2026'],
    ['2026-03-05T23:30:00Z', 60, '6 Mar 2026'],
    ['2026-03-05T23:30:00Z', 0, '5 Mar 2026'],
    ['2026-03-06T00:30:00Z', -60, '5 Mar 2026'],
    ['2026-12-31T20:00:00Z', 330, '1 Jan 2027'],
    ['2026-03-01T02:00:00Z', -300, '28 Feb 2026'],
  ])('formats %s at offset %i as %s', (iso, offset, expected) => {
    expect(formatDate(iso, offset)).toBe(expected);
  });
});

describe('formatMoney', () => {
  it.each([
    [0, '$0.00'],
    [5, '$0.05'],
    [99, '$0.99'],
    [100, '$1.00'],
    [1234, '$12.34'],
    [4905, '$49.05'],
    [123456789, '$1234567.89'],
  ])('formats %i cents as %s', (cents, expected) => {
    expect(formatMoney(cents)).toBe(expected);
  });
});

describe('chooseChannel', () => {
  it('keeps email for a recipient who prefers email', () => {
    expect(chooseChannel(emailUser, noon)).toBe('email');
  });

  it('keeps email for an email recipient who has a phone', () => {
    expect(chooseChannel({ ...emailUser, phone: '+15550100' }, noon)).toBe('email');
  });

  it('uses sms for a recipient who prefers it and has a phone', () => {
    expect(chooseChannel(smsUser, noon)).toBe('sms');
  });

  it.each(withoutUsablePhone)('falls back to email for %s', (_label, recipient) => {
    expect(chooseChannel(recipient, noon)).toBe('email');
  });
});

describe('quiet hours', () => {
  it.each([
    ['2026-03-08T21:59:59Z', 0, 'sms'],
    ['2026-03-08T22:00:00Z', 0, 'email'],
    ['2026-03-08T23:59:59Z', 0, 'email'],
    ['2026-03-09T00:00:00Z', 0, 'email'],
    ['2026-03-09T06:59:59Z', 0, 'email'],
    ['2026-03-09T07:00:00Z', 0, 'sms'],
    ['2026-03-08T13:00:00Z', 0, 'sms'],
    ['2026-03-08T20:30:00Z', 120, 'email'],
    ['2026-03-08T19:59:00Z', 120, 'sms'],
    ['2026-03-09T04:59:00Z', 120, 'email'],
    ['2026-03-09T05:00:00Z', 120, 'sms'],
    ['2026-03-08T16:29:00Z', 330, 'sms'],
    ['2026-03-08T16:30:00Z', 330, 'email'],
    ['2026-03-09T01:29:00Z', 330, 'email'],
    ['2026-03-09T01:30:00Z', 330, 'sms'],
    ['2026-03-08T06:59:00Z', -480, 'email'],
    ['2026-03-08T07:00:00Z', -480, 'email'],
    ['2026-03-08T15:00:00Z', -480, 'sms'],
    ['2026-03-09T05:59:00Z', -480, 'sms'],
    ['2026-03-09T06:00:00Z', -480, 'email'],
  ])('at %s with offset %i an sms recipient gets %s', (iso, offset, expected) => {
    expect(chooseChannel({ ...smsUser, utcOffsetMinutes: offset }, iso)).toBe(expected);
  });

  it('never changes an email recipient', () => {
    expect(chooseChannel(emailUser, '2026-03-08T23:00:00Z')).toBe('email');
  });
});

describe('receiptMessage', () => {
  const input = {
    now: '2026-03-08T09:00:00Z',
    heading: 'Order #7',
    lines: ['1 x Lamp', 'Shipping: $2.00'],
    totalCents: 1205,
  };

  it('builds an email receipt', () => {
    expect(receiptMessage({ ...input, recipient: emailUser })).toEqual({
      channel: 'email',
      to: 'ada@example.com',
      subject: 'Receipt: Order #7',
      body: 'Hi Ada Lovelace,\n\n1 x Lamp\nShipping: $2.00\n\nTotal: $12.05\nIssued 8 Mar 2026\n',
    });
  });

  it('builds an sms receipt', () => {
    expect(receiptMessage({ ...input, recipient: smsUser })).toEqual({
      channel: 'sms',
      to: '+15550100',
      text: 'Order #7: total $12.05 (8 Mar 2026)',
    });
  });

  it('dates the receipt in the recipient offset', () => {
    expect(
      receiptMessage({
        ...input,
        now: '2026-03-08T23:30:00Z',
        recipient: { ...emailUser, utcOffsetMinutes: 60 },
      }),
    ).toEqual({
      channel: 'email',
      to: 'ada@example.com',
      subject: 'Receipt: Order #7',
      body: 'Hi Ada Lovelace,\n\n1 x Lamp\nShipping: $2.00\n\nTotal: $12.05\nIssued 9 Mar 2026\n',
    });
  });

  it('sends the receipt by email inside quiet hours', () => {
    expect(receiptMessage({ ...input, now: '2026-03-08T23:30:00Z', recipient: smsUser })).toEqual({
      channel: 'email',
      to: 'grace@example.com',
      subject: 'Receipt: Order #7',
      body: 'Hi Grace Hopper,\n\n1 x Lamp\nShipping: $2.00\n\nTotal: $12.05\nIssued 8 Mar 2026\n',
    });
  });
});

describe('reminderMessage', () => {
  const input = {
    now: '2026-03-08T09:00:00Z',
    heading: 'Plan renews soon',
    text: 'It renews for $60.00.',
    dueAt: '2026-03-12T23:30:00Z',
  };

  it('builds an email reminder', () => {
    expect(reminderMessage({ ...input, recipient: emailUser })).toEqual({
      channel: 'email',
      to: 'ada@example.com',
      subject: 'Reminder: Plan renews soon',
      body: 'Hi Ada Lovelace,\n\nIt renews for $60.00.\n\nDue 12 Mar 2026\nSent 8 Mar 2026\n',
    });
  });

  it('builds an sms reminder', () => {
    expect(reminderMessage({ ...input, recipient: smsUser })).toEqual({
      channel: 'sms',
      to: '+15550100',
      text: 'Plan renews soon: It renews for $60.00. (due 12 Mar 2026)',
    });
  });

  it('dates the reminder in the recipient offset', () => {
    expect(reminderMessage({ ...input, recipient: { ...smsUser, utcOffsetMinutes: 60 } })).toEqual({
      channel: 'sms',
      to: '+15550100',
      text: 'Plan renews soon: It renews for $60.00. (due 13 Mar 2026)',
    });
  });

  it('sends the reminder by email inside quiet hours', () => {
    expect(reminderMessage({ ...input, now: '2026-03-09T03:00:00Z', recipient: smsUser })).toEqual({
      channel: 'email',
      to: 'grace@example.com',
      subject: 'Reminder: Plan renews soon',
      body: 'Hi Grace Hopper,\n\nIt renews for $60.00.\n\nDue 12 Mar 2026\nSent 9 Mar 2026\n',
    });
  });
});

describe('features using the notifications', () => {
  const order = {
    id: '9',
    placedAt: '2026-03-05T23:30:00Z',
    payBy: '2026-03-12T12:00:00Z',
    shippingCents: 0,
    lines: [{ name: 'Lamp', quantity: 1, unitCents: 2500 }],
  };

  it('dates an order receipt in the customer offset', () => {
    expect(
      orderReceipt(order, { ...emailUser, utcOffsetMinutes: 120 }, '2026-03-08T09:00:00Z'),
    ).toEqual({
      channel: 'email',
      to: 'ada@example.com',
      subject: 'Receipt: Order #9',
      body: 'Hi Ada Lovelace,\n\n1 x Lamp @ $25.00 = $25.00\nShipping: $0.00\nPlaced on 6 Mar 2026\n\nTotal: $25.00\nIssued 8 Mar 2026\n',
    });
  });

  it('emails an order receipt to an sms customer whose phone is blank', () => {
    expect(orderReceipt(order, { ...smsUser, phone: ' ' }, '2026-03-08T09:00:00Z')).toEqual({
      channel: 'email',
      to: 'grace@example.com',
      subject: 'Receipt: Order #9',
      body: 'Hi Grace Hopper,\n\n1 x Lamp @ $25.00 = $25.00\nShipping: $0.00\nPlaced on 5 Mar 2026\n\nTotal: $25.00\nIssued 8 Mar 2026\n',
    });
  });

  it('emails a subscription reminder inside quiet hours', () => {
    const subscription: Parameters<typeof subscriptionReminder>[0] = {
      id: 'S-9',
      plan: 'Pro',
      interval: 'yearly',
      seats: 1,
      seatPriceCents: 9950,
      renewsOn: '2026-04-10T20:00:00Z',
    };
    expect(subscriptionReminder(subscription, smsUser, '2026-03-08T22:30:00Z')).toEqual({
      channel: 'email',
      to: 'grace@example.com',
      subject: 'Reminder: Pro plan renews soon',
      body: 'Hi Grace Hopper,\n\nYour Pro plan renews for $99.50.\n\nDue 10 Apr 2026\nSent 8 Mar 2026\n',
    });
  });
});
