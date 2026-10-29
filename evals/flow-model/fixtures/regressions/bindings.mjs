import { PAID_A, PAID_ANY, code, fixture } from '../source.mjs';

export const BINDING_FIXTURES = [
  fixture('helper-default-parameters', {
    title: 'A helper publishes through default parameter values its caller leaves out',
    source: code`
      function announce(b, o, event = 'OrderPaid', go = true) {
        if (go) {
          b.publish(event, o.id);
        }
      }

      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        announce(bus, order);
        return 'announced';
      }
    `,
    expect: { status: 'complete', violations: [PAID_A] },
  }),
  fixture('catch-destructuring', {
    title: 'A destructured catch binding is read from the thrown value, not left undefined',
    source: code`
      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        try {
          db.commit(order, 'paid');
        } catch ({ message }) {
          if (message) {
            bus.publish('OrderPaid', order.id);
          }
        }
        return 'done';
      }
    `,
    expect: { status: 'partial', reasons: ['unknown-guard'], violations: [PAID_A] },
  }),
  fixture('const-object-spread', {
    title: 'A spread in an as-const object may override the member a guard reads',
    source: code`
      const base = { pending: 'paid' };
      const Status = { pending: 'pending', ...base } as const;

      export function payOrder(order, db, bus) {
        if (order.status === Status.pending) {
          db.commit(order, 'refunded');
        }
        return 'done';
      }
    `,
    expect: {
      status: 'partial',
      reasons: ['unknown-guard'],
      violations: [
        'order-status|db.commit|A|pending|refunded',
        'order-status|db.commit|A|cancelled|refunded',
      ],
    },
  }),
  fixture('shadowed-error', {
    title: 'A locally declared Error class is not the pure global constructor',
    source: code`
      class Error {
        constructor() {
          throw 'boom';
        }
      }

      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          throw new Error();
        }
        db.commit(order, 'paid');
        bus.publish('OrderPaid', order.id);
      }
    `,
    expect: { status: 'partial', reasons: ['unknown-call'] },
  }),
  fixture('inherited-property', {
    title: 'An object literal inherits toString, so reading it is not undefined',
    source: code`
      export function payOrder(order, db, bus) {
        const record = { id: order.id };
        if (record.toString) {
          db.commit(order, 'paid');
        }
        bus.publish('OrderPaid', order.id);
      }
    `,
    expect: {
      status: 'partial',
      reasons: ['unknown-guard'],
      violations: [
        'order-status|db.commit|A|paid|paid',
        'order-status|db.commit|A|cancelled|paid',
        PAID_A,
      ],
    },
  }),
  fixture('undeclared-receiver', {
    title: 'A global named like an effect receiver is not that receiver',
    source: code`
      export function payOrder(order, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        db.commit(order, 'paid');
        bus.publish('OrderPaid', order.id);
      }
    `,
    expect: {
      status: 'partial',
      reasons: ['unknown-call', 'unknown-entity'],
      violations: [PAID_ANY],
    },
  }),
  fixture('rest-destructuring', {
    title: 'Names bound next to a rest element are unknown values, not undefined',
    source: code`
      export function payOrder(order, db, bus) {
        const { id, ...rest } = order;
        bus.publish('OrderPaid', id);
        return rest;
      }
    `,
    expect: {
      status: 'partial',
      reasons: ['unknown-entity', 'unsupported-syntax'],
      violations: [PAID_ANY],
    },
  }),
  fixture('deleted-field', {
    title: 'A deleted status is no longer one of the declared statuses',
    source: code`
      export function payOrder(order, db, bus) {
        delete order.status;
        db.commit(order, 'paid');
      }
    `,
    expect: {
      status: 'partial',
      reasons: ['unknown-entity', 'unknown-state', 'unsupported-syntax'],
      violations: ['order-status|db.commit|?|?|paid'],
    },
  }),
];
