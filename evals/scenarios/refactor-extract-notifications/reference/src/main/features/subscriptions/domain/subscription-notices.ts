import {
  formatDate,
  formatMoney,
  receiptMessage,
  reminderMessage,
} from '../../notifications/index.js';
import type { Message, Recipient } from '../../notifications/index.js';
import { subscriptionTotalCents } from './subscription.js';
import type { Subscription } from './subscription.js';

export function subscriptionReceipt(
  subscription: Subscription,
  subscriber: Recipient,
  now: string,
): Message {
  return receiptMessage({
    recipient: subscriber,
    now,
    heading: `${subscription.plan} plan renewal`,
    lines: [
      `Plan: ${subscription.plan} (${subscription.interval})`,
      `Seats: ${String(subscription.seats)} x ${formatMoney(subscription.seatPriceCents)}`,
      `Next renewal: ${formatDate(subscription.renewsOn, subscriber.utcOffsetMinutes)}`,
    ],
    totalCents: subscriptionTotalCents(subscription),
  });
}

export function subscriptionReminder(
  subscription: Subscription,
  subscriber: Recipient,
  now: string,
): Message {
  return reminderMessage({
    recipient: subscriber,
    now,
    heading: `${subscription.plan} plan renews soon`,
    text: `Your ${subscription.plan} plan renews for ${formatMoney(subscriptionTotalCents(subscription))}.`,
    dueAt: subscription.renewsOn,
  });
}
