import { describe, expect, it } from 'vitest';
import {
  subscriptionReceipt,
  subscriptionReminder,
} from '../src/main/features/subscriptions/index.js';

type Subscriber = Parameters<typeof subscriptionReceipt>[1];

const team: Parameters<typeof subscriptionReceipt>[0] = {
  id: 'S-1',
  plan: 'Team',
  interval: 'monthly',
  seats: 5,
  seatPriceCents: 1200,
  renewsOn: '2026-04-01T03:00:00Z',
};

const west: Subscriber = {
  name: 'Grace Hopper',
  email: 'grace@example.com',
  preferredChannel: 'email',
  utcOffsetMinutes: -480,
};

const india: Subscriber = {
  name: 'Linus Torvalds',
  email: 'linus@example.com',
  phone: '+15550142',
  preferredChannel: 'sms',
  utcOffsetMinutes: 330,
};

const now = '2026-03-25T09:00:00Z';

describe('subscriptionReceipt', () => {
  it('emails a receipt with dates in the subscriber offset', () => {
    expect(subscriptionReceipt(team, west, now)).toEqual({
      channel: 'email',
      to: 'grace@example.com',
      subject: 'Receipt: Team plan renewal',
      body: 'Hi Grace Hopper,\n\nPlan: Team (monthly)\nSeats: 5 x $12.00\nNext renewal: 31 Mar 2026\n\nTotal: $60.00\nIssued 25 Mar 2026\n',
    });
  });

  it('texts a one-line receipt to a subscriber who prefers sms', () => {
    expect(subscriptionReceipt(team, india, now)).toEqual({
      channel: 'sms',
      to: '+15550142',
      text: 'Team plan renewal: total $60.00 (25 Mar 2026)',
    });
  });

  it('falls back to email when the subscriber prefers sms but has no phone', () => {
    const withoutPhone: Subscriber = {
      name: 'Linus Torvalds',
      email: 'linus@example.com',
      preferredChannel: 'sms',
      utcOffsetMinutes: 330,
    };
    expect(subscriptionReceipt(team, withoutPhone, now)).toEqual({
      channel: 'email',
      to: 'linus@example.com',
      subject: 'Receipt: Team plan renewal',
      body: 'Hi Linus Torvalds,\n\nPlan: Team (monthly)\nSeats: 5 x $12.00\nNext renewal: 1 Apr 2026\n\nTotal: $60.00\nIssued 25 Mar 2026\n',
    });
  });
});

describe('subscriptionReminder', () => {
  it('emails a renewal reminder', () => {
    expect(subscriptionReminder(team, west, now)).toEqual({
      channel: 'email',
      to: 'grace@example.com',
      subject: 'Reminder: Team plan renews soon',
      body: 'Hi Grace Hopper,\n\nYour Team plan renews for $60.00.\n\nDue 31 Mar 2026\nSent 25 Mar 2026\n',
    });
  });

  it('texts a renewal reminder', () => {
    expect(subscriptionReminder(team, india, now)).toEqual({
      channel: 'sms',
      to: '+15550142',
      text: 'Team plan renews soon: Your Team plan renews for $60.00. (due 1 Apr 2026)',
    });
  });
});
