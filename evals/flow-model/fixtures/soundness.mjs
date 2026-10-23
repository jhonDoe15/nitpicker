import { ANY_EFFECT, PAID_A, PAID_ANY, UNKNOWN_CALL, code, fixture } from './source.mjs';

export const SOUNDNESS_FIXTURES = [
  fixture('loose-inequality', {
    title: 'A loose inequality on a declared status domain guards the commit',
    source: code`
      export function payOrder(order, db, bus) {
        if (order.status != 'pending') {
          return 'skipped';
        }
        db.commit(order, 'paid');
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    expect: { status: 'complete' },
  }),
  fixture('amount-guard-declared', {
    title: 'Two relational guards on a declared amount domain stay correlated',
    source: code`
      export function payOrder(order, payment, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        if (payment.amount > 100) {
          db.commit(order, 'paid');
        }
        if (payment.amount > 100) {
          bus.publish('OrderPaid', order.id);
        }
        return 'done';
      }
    `,
    expect: { status: 'complete' },
  }),
  fixture('amount-guard-undeclared', {
    title: 'The same relational guards on a field without a declared domain',
    source: code`
      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        if (order.total > 100) {
          db.commit(order, 'paid');
        }
        if (order.total > 100) {
          bus.publish('OrderPaid', order.id);
        }
        return 'done';
      }
    `,
    expect: { status: 'partial', reasons: ['unknown-guard'], violations: [PAID_A] },
  }),
  fixture('compound-assignment', {
    title: 'A compound assignment changes the local that guards the publish',
    source: code`
      export function payOrder(order, db, bus) {
        let state = 'pending';
        state += '!';
        if (state === 'pending') {
          bus.publish('OrderPaid', order.id);
        }
        return state;
      }
    `,
    expect: {
      status: 'partial',
      reasons: ['unknown-guard', 'unsupported-syntax'],
      violations: [PAID_A],
    },
  }),
  fixture('update-and-delete', {
    title: 'An update expression and a delete change the values that guard the publish',
    source: code`
      export function payOrder(order, count, db, bus) {
        let attempts = count;
        attempts++;
        delete order.status;
        if (attempts === 1 && order.status === 'pending') {
          bus.publish('OrderPaid', order.id);
        }
        return 'done';
      }
    `,
    expect: {
      status: 'partial',
      reasons: ['unknown-entity', 'unknown-guard', 'unsupported-syntax'],
      violations: [PAID_ANY],
    },
  }),
  fixture('duplicate-publish-sites', {
    title: 'Two publish calls without a commit are two violations at two call sites',
    source: code`
      export function payOrder(order, flag, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        if (flag) {
          bus.publish('OrderPaid', order.id);
        } else {
          bus.publish('OrderPaid', order.id);
        }
        return 'paid';
      }
    `,
    expect: { status: 'complete', violations: [PAID_A, PAID_A] },
  }),
  fixture('object-identity', {
    title: 'An object literal is identical to itself and different from another literal',
    source: code`
      export function payOrder(order, db, bus) {
        const marker = { id: order.id };
        const copy = { id: order.id };
        if (order.status === 'pending' && marker === marker) {
          db.commit(order, 'paid');
        }
        if (marker === copy) {
          bus.publish('OrderPaid', order.id);
        }
        return 'done';
      }
    `,
    expect: { status: 'complete' },
  }),
  fixture('prototype-named-global', {
    title: 'A bare global call named like an Object.prototype member is an unknown call',
    source: code`
      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        toString(order);
        db.commit(order, 'paid');
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    expect: UNKNOWN_CALL,
  }),
  fixture('optional-call', {
    title: 'An optional call may skip the commit',
    source: code`
      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        db?.commit(order, 'paid');
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    expect: {
      status: 'partial',
      reasons: ['unknown-entity', 'unsupported-syntax'],
      violations: [...ANY_EFFECT, PAID_ANY],
    },
  }),
  fixture('unknown-constructor', {
    title: 'A constructor without reviewed semantics is an unknown call',
    source: code`
      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        const receipt = new Receipt(order);
        db.commit(order, 'paid');
        bus.publish('OrderPaid', order.id);
        return receipt;
      }
    `,
    expect: UNKNOWN_CALL,
  }),
  fixture('async-entry', {
    title: 'An async entry is outside the supported subset',
    source: code`
      export async function payOrder(order, db, bus) {
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    expect: { status: 'partial', reasons: ['async'], violations: [PAID_A] },
  }),
];
