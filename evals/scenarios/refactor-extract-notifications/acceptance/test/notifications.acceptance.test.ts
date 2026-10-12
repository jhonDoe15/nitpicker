import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ordersMain, subscriptionsMain } from '../src/main/composition-root.js';
import {
  chooseChannel,
  formatDate,
  formatMoney,
  receiptMessage,
  reminderMessage,
} from '../src/main/features/notifications/index.js';
import type { Recipient } from '../src/main/features/notifications/index.js';
import { orderReceipt, orderReminder } from '../src/main/features/orders/index.js';
import {
  subscriptionReceipt,
  subscriptionReminder,
} from '../src/main/features/subscriptions/index.js';

type Order = Parameters<typeof orderReceipt>[0];
type Subscription = Parameters<typeof subscriptionReceipt>[0];

const ada: Recipient = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  preferredChannel: 'email',
  utcOffsetMinutes: 0,
};

const grace: Recipient = {
  name: 'Grace Hopper',
  email: 'grace@example.com',
  phone: '+15550100',
  preferredChannel: 'sms',
  utcOffsetMinutes: 0,
};

const order: Order = {
  id: '77',
  placedAt: '2026-03-05T23:30:00Z',
  payBy: '2026-03-12T23:30:00Z',
  shippingCents: 205,
  lines: [{ name: 'Lamp', quantity: 3, unitCents: 1005 }],
};

const subscription: Subscription = {
  id: 'S-77',
  plan: 'Pro',
  interval: 'yearly',
  seats: 2,
  seatPriceCents: 9905,
  renewsOn: '2026-04-10T23:30:00Z',
};

function capture(run: () => void): string {
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  run();
  return write.mock.calls.map(([chunk]) => String(chunk)).join('');
}

function sources(directory: string): readonly string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => readFileSync(path.join(entry.parentPath, entry.name), 'utf8'));
}

afterEach(() => {
  vi.restoreAllMocks();
});

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
    ['2026-03-05T23:30:00Z', 29, '5 Mar 2026'],
    ['2026-03-05T23:30:00Z', 30, '6 Mar 2026'],
    ['2026-03-06T00:30:00Z', -30, '6 Mar 2026'],
    ['2026-03-06T00:30:00Z', -31, '5 Mar 2026'],
    ['2026-12-31T20:00:00Z', 330, '1 Jan 2027'],
    ['2026-03-01T02:00:00Z', -300, '28 Feb 2026'],
    ['2024-03-01T02:00:00Z', -300, '29 Feb 2024'],
  ])('formats %s at offset %i as %s', (iso, offset, expected) => {
    expect(formatDate(iso, offset)).toBe(expected);
  });
});

describe('formatMoney', () => {
  it.each([
    [0, '$0.00'],
    [5, '$0.05'],
    [10, '$0.10'],
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
  const noon = '2026-03-08T12:00:00Z';

  it('uses email for an email recipient, phone or not', () => {
    expect(chooseChannel(ada, noon)).toBe('email');
    expect(chooseChannel({ ...ada, phone: '+15550100' }, noon)).toBe('email');
  });

  it('uses sms for an sms recipient with a phone', () => {
    expect(chooseChannel(grace, noon)).toBe('sms');
  });

  it.each([
    ['no phone', { ...ada, preferredChannel: 'sms' }],
    ['an empty phone', { ...grace, phone: '' }],
    ['a blank phone', { ...grace, phone: ' \t ' }],
  ] satisfies readonly (readonly [string, Recipient])[])(
    'falls back to email with %s',
    (_label, recipient) => {
      expect(chooseChannel(recipient, noon)).toBe('email');
    },
  );

  it.each([
    ['2026-03-08T21:59:59Z', 0, 'sms'],
    ['2026-03-08T22:00:00Z', 0, 'email'],
    ['2026-03-08T23:59:59Z', 0, 'email'],
    ['2026-03-09T00:00:00Z', 0, 'email'],
    ['2026-03-09T03:15:00Z', 0, 'email'],
    ['2026-03-09T06:59:59Z', 0, 'email'],
    ['2026-03-09T07:00:00Z', 0, 'sms'],
    ['2026-03-08T13:00:00Z', 0, 'sms'],
    ['2026-03-08T19:59:00Z', 120, 'sms'],
    ['2026-03-08T20:00:00Z', 120, 'email'],
    ['2026-03-09T04:59:00Z', 120, 'email'],
    ['2026-03-09T05:00:00Z', 120, 'sms'],
    ['2026-03-08T16:29:00Z', 330, 'sms'],
    ['2026-03-08T16:30:00Z', 330, 'email'],
    ['2026-03-09T01:29:00Z', 330, 'email'],
    ['2026-03-09T01:30:00Z', 330, 'sms'],
    ['2026-03-08T06:59:00Z', -480, 'email'],
    ['2026-03-08T15:00:00Z', -480, 'sms'],
    ['2026-03-09T05:59:00Z', -480, 'sms'],
    ['2026-03-09T06:00:00Z', -480, 'email'],
    ['2026-03-09T14:59:00Z', -480, 'email'],
    ['2026-03-09T15:00:00Z', -480, 'sms'],
  ])('at %s in offset %i an sms recipient is sent by %s', (iso, offset, expected) => {
    expect(chooseChannel({ ...grace, utcOffsetMinutes: offset }, iso)).toBe(expected);
  });

  it('leaves an email recipient on email at any hour', () => {
    expect(chooseChannel(ada, '2026-03-08T23:00:00Z')).toBe('email');
    expect(chooseChannel(ada, '2026-03-09T09:00:00Z')).toBe('email');
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
    expect(receiptMessage({ ...input, recipient: ada })).toEqual({
      channel: 'email',
      to: 'ada@example.com',
      subject: 'Receipt: Order #7',
      body: 'Hi Ada Lovelace,\n\n1 x Lamp\nShipping: $2.00\n\nTotal: $12.05\nIssued 8 Mar 2026\n',
    });
  });

  it('builds an sms receipt', () => {
    expect(receiptMessage({ ...input, recipient: grace })).toEqual({
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
        recipient: { ...ada, utcOffsetMinutes: 60 },
      }),
    ).toEqual({
      channel: 'email',
      to: 'ada@example.com',
      subject: 'Receipt: Order #7',
      body: 'Hi Ada Lovelace,\n\n1 x Lamp\nShipping: $2.00\n\nTotal: $12.05\nIssued 9 Mar 2026\n',
    });
  });

  it('builds an email receipt for an sms recipient in quiet hours', () => {
    expect(receiptMessage({ ...input, now: '2026-03-08T23:30:00Z', recipient: grace })).toEqual({
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
    expect(reminderMessage({ ...input, recipient: ada })).toEqual({
      channel: 'email',
      to: 'ada@example.com',
      subject: 'Reminder: Plan renews soon',
      body: 'Hi Ada Lovelace,\n\nIt renews for $60.00.\n\nDue 12 Mar 2026\nSent 8 Mar 2026\n',
    });
  });

  it('builds an sms reminder', () => {
    expect(reminderMessage({ ...input, recipient: grace })).toEqual({
      channel: 'sms',
      to: '+15550100',
      text: 'Plan renews soon: It renews for $60.00. (due 12 Mar 2026)',
    });
  });

  it('dates the reminder in the recipient offset', () => {
    expect(
      reminderMessage({
        ...input,
        now: '2026-03-08T22:15:00Z',
        recipient: { ...ada, utcOffsetMinutes: 60 },
      }),
    ).toEqual({
      channel: 'email',
      to: 'ada@example.com',
      subject: 'Reminder: Plan renews soon',
      body: 'Hi Ada Lovelace,\n\nIt renews for $60.00.\n\nDue 13 Mar 2026\nSent 8 Mar 2026\n',
    });
  });

  it('builds an email reminder for an sms recipient in quiet hours', () => {
    expect(reminderMessage({ ...input, now: '2026-03-09T03:00:00Z', recipient: grace })).toEqual({
      channel: 'email',
      to: 'grace@example.com',
      subject: 'Reminder: Plan renews soon',
      body: 'Hi Grace Hopper,\n\nIt renews for $60.00.\n\nDue 12 Mar 2026\nSent 9 Mar 2026\n',
    });
  });
});

describe('orders', () => {
  const now = '2026-03-08T09:00:00Z';

  it('keeps the email receipt, dating it in the customer offset', () => {
    expect(orderReceipt(order, { ...ada, utcOffsetMinutes: 120 }, now)).toEqual({
      channel: 'email',
      to: 'ada@example.com',
      subject: 'Receipt: Order #77',
      body: 'Hi Ada Lovelace,\n\n3 x Lamp @ $10.05 = $30.15\nShipping: $2.05\nPlaced on 6 Mar 2026\n\nTotal: $32.20\nIssued 8 Mar 2026\n',
    });
  });

  it('keeps the sms receipt and reminder', () => {
    expect(orderReceipt(order, grace, now)).toEqual({
      channel: 'sms',
      to: '+15550100',
      text: 'Order #77: total $32.20 (8 Mar 2026)',
    });
    expect(orderReminder(order, grace, now)).toEqual({
      channel: 'sms',
      to: '+15550100',
      text: 'Order #77 awaiting payment: Please pay $32.20 to keep your order. (due 12 Mar 2026)',
    });
  });

  it('dates the reminder in the customer offset', () => {
    expect(orderReminder(order, { ...ada, utcOffsetMinutes: 90 }, now)).toEqual({
      channel: 'email',
      to: 'ada@example.com',
      subject: 'Reminder: Order #77 awaiting payment',
      body: 'Hi Ada Lovelace,\n\nPlease pay $32.20 to keep your order.\n\nDue 13 Mar 2026\nSent 8 Mar 2026\n',
    });
  });

  it('emails an sms customer whose phone is blank', () => {
    expect(orderReminder(order, { ...grace, phone: '  ' }, now)).toEqual({
      channel: 'email',
      to: 'grace@example.com',
      subject: 'Reminder: Order #77 awaiting payment',
      body: 'Hi Grace Hopper,\n\nPlease pay $32.20 to keep your order.\n\nDue 12 Mar 2026\nSent 8 Mar 2026\n',
    });
  });

  it('emails an sms customer inside quiet hours', () => {
    expect(orderReceipt(order, grace, '2026-03-09T02:00:00Z')).toEqual({
      channel: 'email',
      to: 'grace@example.com',
      subject: 'Receipt: Order #77',
      body: 'Hi Grace Hopper,\n\n3 x Lamp @ $10.05 = $30.15\nShipping: $2.05\nPlaced on 5 Mar 2026\n\nTotal: $32.20\nIssued 9 Mar 2026\n',
    });
  });
});

describe('subscriptions', () => {
  const now = '2026-03-25T09:00:00Z';
  const west: Recipient = { ...ada, utcOffsetMinutes: -480 };

  it('keeps the email receipt, dated in the subscriber offset', () => {
    expect(subscriptionReceipt(subscription, west, now)).toEqual({
      channel: 'email',
      to: 'ada@example.com',
      subject: 'Receipt: Pro plan renewal',
      body: 'Hi Ada Lovelace,\n\nPlan: Pro (yearly)\nSeats: 2 x $99.05\nNext renewal: 10 Apr 2026\n\nTotal: $198.10\nIssued 25 Mar 2026\n',
    });
  });

  it('keeps the sms reminder', () => {
    expect(subscriptionReminder(subscription, grace, now)).toEqual({
      channel: 'sms',
      to: '+15550100',
      text: 'Pro plan renews soon: Your Pro plan renews for $198.10. (due 10 Apr 2026)',
    });
  });

  it('emails an sms subscriber whose phone is blank', () => {
    expect(subscriptionReceipt(subscription, { ...grace, phone: '' }, now)).toEqual({
      channel: 'email',
      to: 'grace@example.com',
      subject: 'Receipt: Pro plan renewal',
      body: 'Hi Grace Hopper,\n\nPlan: Pro (yearly)\nSeats: 2 x $99.05\nNext renewal: 10 Apr 2026\n\nTotal: $198.10\nIssued 25 Mar 2026\n',
    });
  });

  it('emails an sms subscriber inside quiet hours', () => {
    expect(subscriptionReminder(subscription, grace, '2026-03-25T22:00:00Z')).toEqual({
      channel: 'email',
      to: 'grace@example.com',
      subject: 'Reminder: Pro plan renews soon',
      body: 'Hi Grace Hopper,\n\nYour Pro plan renews for $198.10.\n\nDue 10 Apr 2026\nSent 25 Mar 2026\n',
    });
  });
});

describe('composition root', () => {
  it('prints the seeded orders as before', () => {
    expect(
      capture(() => {
        ordersMain('2026-03-08T09:00:00Z');
      }),
    ).toBe(
      [
        '{"channel":"email","to":"ada@example.com","subject":"Receipt: Order #1001","body":"Hi Ada Lovelace,\\n\\n2 x Notebook @ $4.50 = $9.00\\n1 x Pen set @ $12.00 = $12.00\\nShipping: $3.99\\nPlaced on 5 Mar 2026\\n\\nTotal: $24.99\\nIssued 8 Mar 2026\\n"}',
        '{"channel":"email","to":"ada@example.com","subject":"Reminder: Order #1001 awaiting payment","body":"Hi Ada Lovelace,\\n\\nPlease pay $24.99 to keep your order.\\n\\nDue 12 Mar 2026\\nSent 8 Mar 2026\\n"}',
        '{"channel":"sms","to":"+15550100","text":"Order #1002: total $49.05 (8 Mar 2026)"}',
        '{"channel":"sms","to":"+15550100","text":"Order #1002 awaiting payment: Please pay $49.05 to keep your order. (due 13 Mar 2026)"}',
        '{"channel":"email","to":"alan@example.com","subject":"Receipt: Order #1003","body":"Hi Alan Turing,\\n\\n12 x Bookmark @ $0.75 = $9.00\\nShipping: $2.50\\nPlaced on 7 Mar 2026\\n\\nTotal: $11.50\\nIssued 8 Mar 2026\\n"}',
        '{"channel":"email","to":"alan@example.com","subject":"Reminder: Order #1003 awaiting payment","body":"Hi Alan Turing,\\n\\nPlease pay $11.50 to keep your order.\\n\\nDue 14 Mar 2026\\nSent 8 Mar 2026\\n"}',
        '',
      ].join('\n'),
    );
  });

  it('prints the seeded subscriptions as before', () => {
    expect(
      capture(() => {
        subscriptionsMain('2026-03-25T09:00:00Z');
      }),
    ).toBe(
      [
        '{"channel":"email","to":"grace@example.com","subject":"Receipt: Team plan renewal","body":"Hi Grace Hopper,\\n\\nPlan: Team (monthly)\\nSeats: 5 x $12.00\\nNext renewal: 31 Mar 2026\\n\\nTotal: $60.00\\nIssued 25 Mar 2026\\n"}',
        '{"channel":"email","to":"grace@example.com","subject":"Reminder: Team plan renews soon","body":"Hi Grace Hopper,\\n\\nYour Team plan renews for $60.00.\\n\\nDue 31 Mar 2026\\nSent 25 Mar 2026\\n"}',
        '{"channel":"sms","to":"+15550142","text":"Pro plan renewal: total $99.50 (25 Mar 2026)"}',
        '{"channel":"sms","to":"+15550142","text":"Pro plan renews soon: Your Pro plan renews for $99.50. (due 11 Apr 2026)"}',
        '',
      ].join('\n'),
    );
  });

  it('prints the seeded orders by email once the sms customer is in quiet hours', () => {
    expect(
      capture(() => {
        ordersMain('2026-03-08T21:30:00Z');
      }),
    ).toBe(
      [
        '{"channel":"email","to":"ada@example.com","subject":"Receipt: Order #1001","body":"Hi Ada Lovelace,\\n\\n2 x Notebook @ $4.50 = $9.00\\n1 x Pen set @ $12.00 = $12.00\\nShipping: $3.99\\nPlaced on 5 Mar 2026\\n\\nTotal: $24.99\\nIssued 8 Mar 2026\\n"}',
        '{"channel":"email","to":"ada@example.com","subject":"Reminder: Order #1001 awaiting payment","body":"Hi Ada Lovelace,\\n\\nPlease pay $24.99 to keep your order.\\n\\nDue 12 Mar 2026\\nSent 8 Mar 2026\\n"}',
        '{"channel":"email","to":"grace@example.com","subject":"Receipt: Order #1002","body":"Hi Grace Hopper,\\n\\n1 x Desk lamp @ $49.05 = $49.05\\nShipping: $0.00\\nPlaced on 6 Mar 2026\\n\\nTotal: $49.05\\nIssued 8 Mar 2026\\n"}',
        '{"channel":"email","to":"grace@example.com","subject":"Reminder: Order #1002 awaiting payment","body":"Hi Grace Hopper,\\n\\nPlease pay $49.05 to keep your order.\\n\\nDue 13 Mar 2026\\nSent 8 Mar 2026\\n"}',
        '{"channel":"email","to":"alan@example.com","subject":"Receipt: Order #1003","body":"Hi Alan Turing,\\n\\n12 x Bookmark @ $0.75 = $9.00\\nShipping: $2.50\\nPlaced on 7 Mar 2026\\n\\nTotal: $11.50\\nIssued 8 Mar 2026\\n"}',
        '{"channel":"email","to":"alan@example.com","subject":"Reminder: Order #1003 awaiting payment","body":"Hi Alan Turing,\\n\\nPlease pay $11.50 to keep your order.\\n\\nDue 14 Mar 2026\\nSent 8 Mar 2026\\n"}',
        '',
      ].join('\n'),
    );
  });

  it('prints the seeded subscriptions by email once the sms subscriber is in quiet hours', () => {
    expect(
      capture(() => {
        subscriptionsMain('2026-03-25T17:00:00Z');
      }),
    ).toBe(
      [
        '{"channel":"email","to":"grace@example.com","subject":"Receipt: Team plan renewal","body":"Hi Grace Hopper,\\n\\nPlan: Team (monthly)\\nSeats: 5 x $12.00\\nNext renewal: 31 Mar 2026\\n\\nTotal: $60.00\\nIssued 25 Mar 2026\\n"}',
        '{"channel":"email","to":"grace@example.com","subject":"Reminder: Team plan renews soon","body":"Hi Grace Hopper,\\n\\nYour Team plan renews for $60.00.\\n\\nDue 31 Mar 2026\\nSent 25 Mar 2026\\n"}',
        '{"channel":"email","to":"linus@example.com","subject":"Receipt: Pro plan renewal","body":"Hi Linus Torvalds,\\n\\nPlan: Pro (yearly)\\nSeats: 1 x $99.50\\nNext renewal: 11 Apr 2026\\n\\nTotal: $99.50\\nIssued 25 Mar 2026\\n"}',
        '{"channel":"email","to":"linus@example.com","subject":"Reminder: Pro plan renews soon","body":"Hi Linus Torvalds,\\n\\nYour Pro plan renews for $99.50.\\n\\nDue 11 Apr 2026\\nSent 25 Mar 2026\\n"}',
        '',
      ].join('\n'),
    );
  });
});

describe('the moved code', () => {
  const featuresRoot = path.join(import.meta.dirname, '..', 'src', 'main', 'features');
  const leftBehind = [
    ...sources(path.join(featuresRoot, 'orders')),
    ...sources(path.join(featuresRoot, 'subscriptions')),
    readFileSync(
      path.join(import.meta.dirname, '..', 'src', 'main', 'composition-root.ts'),
      'utf8',
    ),
  ].join('\n');

  it('leaves no message wording, date table or money formatting in orders or subscriptions', () => {
    expect(leftBehind).not.toMatch(/Receipt: |Reminder: |Issued |Sent |Jan|toFixed|padStart/);
  });

  it('leaves no second channel union or message shape outside notifications', () => {
    expect(leftBehind).not.toMatch(
      /'email'\s*\|\s*'sms'|'sms'\s*\|\s*'email'|\bchannel: '(sms|email)'/,
    );
  });
});
