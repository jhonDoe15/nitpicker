import { PAID_A, code, fixture, transition } from './source.mjs';

export const ORDERING_FIXTURES = [
  fixture('correct-ordering', {
    title: 'Commit of the paid state before the OrderPaid event for the same order',
    source: code`
      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        db.commit(order, 'paid');
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    expect: { status: 'complete' },
  }),
  fixture('missing-commit', {
    title: 'OrderPaid is published without any commit',
    source: code`
      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    expect: { status: 'complete', violations: [PAID_A] },
  }),
  fixture('wrong-entity', {
    title: 'The commit is for another order than the published one',
    source: code`
      export function payOrder(order, other, db, bus) {
        if (order.status !== 'pending' || other.status !== 'pending') {
          return 'skipped';
        }
        db.commit(other, 'paid');
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    expect: { status: 'complete', violations: [PAID_A] },
  }),
  fixture('wrong-state', {
    title: 'The committed state is cancelled, not paid',
    source: code`
      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        db.commit(order, 'cancelled');
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    expect: { status: 'complete', violations: [PAID_A] },
  }),
  fixture('unguarded-transition', {
    title: 'The paid commit is not guarded by the current status',
    source: code`
      export function payOrder(order, db, bus) {
        db.commit(order, 'paid');
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    expect: {
      status: 'complete',
      violations: [transition('A', 'paid', 'paid'), transition('A', 'cancelled', 'paid')],
    },
  }),
  fixture('enum-guard', {
    title: 'Enum members as guard and committed state',
    source: code`
      enum OrderStatus {
        Pending = 'pending',
        Paid = 'paid',
      }

      export function payOrder(order: { id: string; status: string }, db, bus) {
        if (order.status === OrderStatus.Pending) {
          db.commit(order, OrderStatus.Paid);
          bus.publish('OrderPaid', order.id);
        }
      }
    `,
    expect: { status: 'complete' },
  }),
  fixture('const-object-event', {
    title: 'Event name read from a const object',
    source: code`
      const Events = { Paid: 'OrderPaid' } as const;

      export function payOrder(order, db, bus) {
        if (order.status === 'pending') {
          db.commit(order, 'paid');
        }
        bus.publish(Events.Paid, order.id);
      }
    `,
    expect: { status: 'complete', violations: [PAID_A] },
  }),
  fixture('second-transition', {
    title: 'Two successive commits follow the allowed transitions',
    source: code`
      export function refundOrder(order, db) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        db.commit(order, 'paid');
        db.commit(order, 'refunded');
        return 'refunded';
      }
    `,
    entry: 'refundOrder',
    expect: { status: 'complete' },
  }),
  fixture('invalid-second-transition', {
    title: 'A paid order is then committed as cancelled',
    source: code`
      export function cancelOrder(order, db) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        db.commit(order, 'paid');
        db.commit(order, 'cancelled');
        return 'cancelled';
      }
    `,
    entry: 'cancelOrder',
    expect: { status: 'complete', violations: [transition('A', 'paid', 'cancelled')] },
  }),
  fixture('throw-guard', {
    title: 'A throw branch rejects orders that are not pending',
    source: code`
      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          throw new Error('not pending');
        }
        db.commit(order, 'paid');
        bus.publish('OrderPaid', order.id);
      }
    `,
    expect: { status: 'complete' },
  }),
];
