import { ANY_EFFECT, PAID_A, PAID_ANY, code, fixture } from '../source.mjs';

export const REGION_FIXTURES = [
  fixture('closure-effect', {
    title: 'A commit inside a closure is reported as a possible effect of the unmodelled code',
    source: code`
      export function payOrder(order, db, bus) {
        const settle = () => db.commit(order, 'paid');
        settle();
        bus.publish('OrderPaid', order.id);
      }
    `,
    expect: {
      status: 'partial',
      reasons: ['unknown-dispatch', 'unknown-entity', 'unsupported-syntax'],
      violations: [...ANY_EFFECT, ...ANY_EFFECT, PAID_ANY],
    },
  }),
  fixture('comma-effect', {
    title: 'A commit inside a comma expression is a possible effect of the unmodelled code',
    source: code`
      export function payOrder(order, db, bus) {
        const result = (db.commit(order, 'paid'), 1);
        bus.publish('OrderPaid', order.id);
        return result;
      }
    `,
    expect: {
      status: 'partial',
      reasons: ['unknown-entity', 'unsupported-syntax'],
      violations: [...ANY_EFFECT, PAID_ANY],
    },
  }),
  fixture('overloaded-helper', {
    title: 'An overload signature is skipped in favour of the implementation',
    source: code`
      function settle(order: { id: string }, db: unknown): void;
      function settle(order, db) {
        db.commit(order, 'paid');
      }

      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        settle(order, db);
        bus.publish('OrderPaid', order.id);
      }
    `,
    expect: { status: 'complete' },
  }),
  fixture('declared-helper', {
    title: 'A declared function without a body is an unknown call',
    source: code`
      declare function audit(order: unknown): void;

      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        audit(order.id);
        db.commit(order, 'paid');
        bus.publish('OrderPaid', order.id);
      }
    `,
    expect: {
      status: 'partial',
      reasons: ['missing-semantics', 'unknown-call'],
      violations: ['order-status|db.commit|A|paid|paid', 'order-status|db.commit|A|cancelled|paid'],
    },
  }),
  fixture('arrow-entry', {
    title: 'An entry declared as a const arrow function runs in the oracle too',
    source: code`
      export const payOrder = (order, db, bus) => {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        bus.publish('OrderPaid', order.id);
        return 'paid';
      };
    `,
    expect: { status: 'complete', violations: [PAID_A] },
  }),
  fixture('async-helper', {
    title: 'An async helper called from a sync entry is unmodelled and not run by the oracle',
    source: code`
      async function announce(b, o) {
        b.publish('OrderPaid', o.id);
      }

      export function payOrder(order, db, bus) {
        announce(bus, order);
        return 'announced';
      }
    `,
    expect: { status: 'partial', reasons: ['async'], violations: ANY_EFFECT },
  }),
];
