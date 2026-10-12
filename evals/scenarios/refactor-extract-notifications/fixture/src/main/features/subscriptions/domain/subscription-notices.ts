import { subscriptionTotalCents } from './subscription.js';
import type { Subscription } from './subscription.js';

type Subscriber = {
  readonly name: string;
  readonly email: string;
  readonly phone?: string;
  readonly preferredChannel: 'email' | 'sms';
  readonly utcOffsetMinutes: number;
};

type NotificationMessage =
  | {
      readonly channel: 'email';
      readonly to: string;
      readonly subject: string;
      readonly body: string;
    }
  | { readonly channel: 'sms'; readonly to: string; readonly text: string };

type Wording = {
  readonly subject: string;
  readonly body: string;
  readonly text: string;
};

const monthNames = 'JanFebMarAprMayJunJulAugSepOctNovDec';

function formatDate(at: string, utcOffsetMinutes: number): string {
  const local = new Date(Date.parse(at) + utcOffsetMinutes * 60_000).toISOString();
  const monthStart = (Number(local.slice(5, 7)) - 1) * 3;
  const month = monthNames.slice(monthStart, monthStart + 3);
  return `${String(Number(local.slice(8, 10)))} ${month} ${local.slice(0, 4)}`;
}

function formatMoney(cents: number): string {
  return `$${String(Math.floor(cents / 100))}.${String(cents % 100).padStart(2, '0')}`;
}

function deliver(subscriber: Subscriber, wording: Wording): NotificationMessage {
  const { phone } = subscriber;
  if (subscriber.preferredChannel === 'sms' && phone !== undefined) {
    return { channel: 'sms', to: phone, text: wording.text };
  }
  return {
    channel: 'email',
    to: subscriber.email,
    subject: wording.subject,
    body: wording.body,
  };
}

export function subscriptionReceipt(
  subscription: Subscription,
  subscriber: Subscriber,
  now: string,
): NotificationMessage {
  const heading = `${subscription.plan} plan renewal`;
  const total = formatMoney(subscriptionTotalCents(subscription));
  const issued = formatDate(now, subscriber.utcOffsetMinutes);
  const lines = [
    `Plan: ${subscription.plan} (${subscription.interval})`,
    `Seats: ${String(subscription.seats)} x ${formatMoney(subscription.seatPriceCents)}`,
    `Next renewal: ${formatDate(subscription.renewsOn, subscriber.utcOffsetMinutes)}`,
  ];
  return deliver(subscriber, {
    subject: `Receipt: ${heading}`,
    body: `Hi ${subscriber.name},\n\n${lines.join('\n')}\n\nTotal: ${total}\nIssued ${issued}\n`,
    text: `${heading}: total ${total} (${issued})`,
  });
}

export function subscriptionReminder(
  subscription: Subscription,
  subscriber: Subscriber,
  now: string,
): NotificationMessage {
  const heading = `${subscription.plan} plan renews soon`;
  const text = `Your ${subscription.plan} plan renews for ${formatMoney(subscriptionTotalCents(subscription))}.`;
  const due = formatDate(subscription.renewsOn, subscriber.utcOffsetMinutes);
  return deliver(subscriber, {
    subject: `Reminder: ${heading}`,
    body: `Hi ${subscriber.name},\n\n${text}\n\nDue ${due}\nSent ${formatDate(now, subscriber.utcOffsetMinutes)}\n`,
    text: `${heading}: ${text} (due ${due})`,
  });
}
