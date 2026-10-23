import { PAID_A, code, fixture, transition } from './source.mjs';

export const LIMIT_FIXTURES = [
  fixture('unknown-helper', {
    title: 'An imported helper with no reviewed semantics receives the order after the guard',
    source: code`
      import { audit } from './audit';

      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        audit(order);
        db.commit(order, 'paid');
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    expect: {
      status: 'partial',
      reasons: ['unknown-call'],
      violations: [transition('A', 'paid', 'paid'), transition('A', 'cancelled', 'paid')],
    },
  }),
  fixture('unknown-dispatch', {
    title: 'The effect is called through a computed member',
    source: code`
      export function payOrder(order, method, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        db[method](order, 'paid');
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    expect: { status: 'partial', reasons: ['unknown-dispatch'], violations: [PAID_A] },
  }),
  fixture('recursion', {
    title: 'A same-file helper retries by calling itself',
    source: code`
      function settle(order, db, retry) {
        try {
          db.commit(order, 'paid');
        } catch (error) {
          if (retry) {
            settle(order, db, false);
          } else {
            throw error;
          }
        }
      }

      export function payOrder(order, retry, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        settle(order, db, retry);
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    expect: {
      status: 'partial',
      reasons: ['recursion'],
      violations: [transition('A', 'paid', 'paid')],
    },
  }),
  fixture('loop', {
    title: 'Commits inside a loop are outside the supported subset',
    source: code`
      export function payAll(items, db) {
        for (const item of items) {
          db.commit(item, 'paid');
        }
        return 'paid';
      }
    `,
    entry: 'payAll',
    expect: { status: 'partial', reasons: ['loop'] },
  }),
  fixture('finally-cleanup', {
    title: 'A finally block is outside the supported subset',
    source: code`
      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        try {
          db.commit(order, 'paid');
        } finally {
          bus.publish('OrderAttempted', order.id);
        }
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    expect: { status: 'partial', reasons: ['unsupported-syntax'], violations: [PAID_A] },
  }),
  fixture('unknown-recovery', {
    title: 'A failed commit is handed to an unknown recovery call',
    source: code`
      import { recover } from './recovery';

      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        try {
          db.commit(order, 'paid');
        } catch (error) {
          recover(order, error);
        }
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    expect: { status: 'partial', reasons: ['unknown-call'], violations: [PAID_A] },
  }),
  fixture('exhausted-budget', {
    title: 'More effect outcomes than the declared state budget allows',
    source: code`
      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        db.commit(order, 'paid');
        bus.publish('OrderPaid', order.id);
        bus.publish('OrderPaid', order.id);
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    bounds: { maxStates: 6 },
    expect: { status: 'partial', reasons: ['state-budget'] },
  }),
];
