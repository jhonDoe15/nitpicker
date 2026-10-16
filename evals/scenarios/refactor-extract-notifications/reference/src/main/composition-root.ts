import type { Message } from './features/notifications/index.js';
import { orderReceipt, orderReminder } from './features/orders/index.js';
import { subscriptionReceipt, subscriptionReminder } from './features/subscriptions/index.js';
export { chooseChannel } from './features/notifications/index.js';

type Order = Parameters<typeof orderReceipt>[0];
type Customer = Parameters<typeof orderReceipt>[1];
type Subscription = Parameters<typeof subscriptionReceipt>[0];
type Subscriber = Parameters<typeof subscriptionReceipt>[1];

const ada: Customer = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  preferredChannel: 'email',
  utcOffsetMinutes: 0,
};

const grace: Customer = {
  name: 'Grace Hopper',
  email: 'grace@example.com',
  phone: '+15550100',
  preferredChannel: 'sms',
  utcOffsetMinutes: 120,
};

const alan: Customer = {
  name: 'Alan Turing',
  email: 'alan@example.com',
  preferredChannel: 'sms',
  utcOffsetMinutes: -300,
};

const orders: readonly { readonly order: Order; readonly customer: Customer }[] = [
  {
    customer: ada,
    order: {
      id: '1001',
      placedAt: '2026-03-05T10:00:00Z',
      payBy: '2026-03-12T12:00:00Z',
      shippingCents: 399,
      lines: [
        { name: 'Notebook', quantity: 2, unitCents: 450 },
        { name: 'Pen set', quantity: 1, unitCents: 1200 },
      ],
    },
  },
  {
    customer: grace,
    order: {
      id: '1002',
      placedAt: '2026-03-06T08:30:00Z',
      payBy: '2026-03-13T12:00:00Z',
      shippingCents: 0,
      lines: [{ name: 'Desk lamp', quantity: 1, unitCents: 4905 }],
    },
  },
  {
    customer: alan,
    order: {
      id: '1003',
      placedAt: '2026-03-07T15:45:00Z',
      payBy: '2026-03-14T12:00:00Z',
      shippingCents: 250,
      lines: [{ name: 'Bookmark', quantity: 12, unitCents: 75 }],
    },
  },
];

const hopper: Subscriber = {
  name: 'Grace Hopper',
  email: 'grace@example.com',
  preferredChannel: 'email',
  utcOffsetMinutes: -480,
};

const linus: Subscriber = {
  name: 'Linus Torvalds',
  email: 'linus@example.com',
  phone: '+15550142',
  preferredChannel: 'sms',
  utcOffsetMinutes: 330,
};

const subscriptions: readonly {
  readonly subscription: Subscription;
  readonly subscriber: Subscriber;
}[] = [
  {
    subscriber: hopper,
    subscription: {
      id: 'S-1',
      plan: 'Team',
      interval: 'monthly',
      seats: 5,
      seatPriceCents: 1200,
      renewsOn: '2026-04-01T03:00:00Z',
    },
  },
  {
    subscriber: linus,
    subscription: {
      id: 'S-2',
      plan: 'Pro',
      interval: 'yearly',
      seats: 1,
      seatPriceCents: 9950,
      renewsOn: '2026-04-10T20:00:00Z',
    },
  },
];

function deliver(message: Message): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

export function ordersMain(now: string): void {
  for (const { order, customer } of orders) {
    deliver(orderReceipt(order, customer, now));
    deliver(orderReminder(order, customer, now));
  }
}

export function subscriptionsMain(now: string): void {
  for (const { subscription, subscriber } of subscriptions) {
    deliver(subscriptionReceipt(subscription, subscriber, now));
    deliver(subscriptionReminder(subscription, subscriber, now));
  }
}
