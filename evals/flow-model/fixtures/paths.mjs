import { PAID_A, transition } from './contracts.mjs';
import { code, fixture } from './source.mjs';

export const PATH_FIXTURES = [
  fixture('branch-only-commit', {
    title: 'The commit happens on one branch only; the event is published after the join',
    source: code`
      export function payOrder(order, flag, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        if (flag) {
          db.commit(order, 'paid');
        }
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    expect: { status: 'complete', violations: [PAID_A] },
  }),
  fixture('joined-branches', {
    title: 'Both branches commit before they join',
    source: code`
      export function payOrder(order, flag, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        if (flag) {
          db.commit(order, 'paid');
        } else {
          const target = order;
          db.commit(target, 'paid');
        }
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    expect: { status: 'complete' },
  }),
  fixture('early-return-join', {
    title: 'An early return removes the path that would publish without a commit',
    source: code`
      export function payOrder(order, flag, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        if (!flag) {
          return 'deferred';
        }
        db.commit(order, 'paid');
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    expect: { status: 'complete' },
  }),
  fixture('unreachable-bad-branch', {
    title: 'The publish without a commit sits under a guard that cannot hold',
    source: code`
      export function payOrder(order, db, bus) {
        if (order.status === 'pending') {
          if (order.status === 'cancelled') {
            bus.publish('OrderPaid', order.id);
          }
          db.commit(order, 'paid');
          bus.publish('OrderPaid', order.id);
        }
      }
    `,
    expect: { status: 'complete' },
  }),
  fixture('contradictory-guards', {
    title: 'A conjunction of two different statuses is never true',
    source: code`
      export function payOrder(order, db, bus) {
        if (order.status === 'pending' && order.status === 'paid') {
          bus.publish('OrderPaid', order.id);
        }
        return 'unchanged';
      }
    `,
    expect: { status: 'complete' },
  }),
  fixture('caught-failure-publishes', {
    title: 'A failed commit is caught and the event is still published',
    source: code`
      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        try {
          db.commit(order, 'paid');
        } catch {
          db.failures = 1;
        }
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    expect: { status: 'complete', violations: [PAID_A] },
  }),
  fixture('caught-failure-returns', {
    title: 'A failed commit is caught and the function returns before publishing',
    source: code`
      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        try {
          db.commit(order, 'paid');
        } catch (error) {
          return { kind: 'failed', error };
        }
        bus.publish('OrderPaid', order.id);
        return { kind: 'paid' };
      }
    `,
    expect: { status: 'complete' },
  }),
  fixture('ambiguous-compensation', {
    title:
      'A timed-out commit may have written paid, so cancelling it is not a definite pending to cancelled',
    source: code`
      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        try {
          db.commit(order, 'paid');
        } catch {
          db.commit(order, 'cancelled');
          return 'cancelled';
        }
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    expect: { status: 'complete', violations: [transition('A', 'paid', 'cancelled')] },
  }),
  fixture('alias-entity', {
    title: 'The order and its id reach the effects through local aliases',
    source: code`
      export function payOrder(order, db, bus) {
        const target = order;
        const id = target.id;
        const status = target.status;
        if (status !== 'pending') {
          return 'skipped';
        }
        db.commit(target, 'paid');
        bus.publish('OrderPaid', id);
        return 'paid';
      }
    `,
    expect: { status: 'complete' },
  }),
  fixture('alias-wrong-entity', {
    title: 'The published id is an alias of the other order',
    source: code`
      export function payOrder(order, other, db, bus) {
        const id = other.id;
        if (order.status !== 'pending') {
          return 'skipped';
        }
        db.commit(order, 'paid');
        bus.publish('OrderPaid', id);
        return 'paid';
      }
    `,
    expect: { status: 'complete', violations: ['paid-before-publish|bus.publish|B'] },
  }),
  fixture('helper-commit', {
    title: 'The commit happens in a same-file helper',
    source: code`
      function settle(target, store) {
        store.commit(target, 'paid');
      }

      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        settle(order, db);
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    expect: { status: 'complete' },
  }),
  fixture('helper-wrong-entity', {
    title: 'The same-file helper commits the other order',
    source: code`
      function settle(target, store) {
        store.commit(target, 'paid');
      }

      export function payOrder(order, other, db, bus) {
        if (order.status !== 'pending' || other.status !== 'pending') {
          return 'skipped';
        }
        settle(other, db);
        bus.publish('OrderPaid', order.id);
        return 'paid';
      }
    `,
    expect: { status: 'complete', violations: [PAID_A] },
  }),
  fixture('helper-result-guard', {
    title: 'A helper returns a result object whose kind guards the publish',
    source: code`
      function settle(order, db) {
        try {
          db.commit(order, 'paid');
          return { kind: 'paid' };
        } catch (error) {
          return { kind: 'failed', error };
        }
      }

      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        const outcome = settle(order, db);
        if (outcome.kind === 'paid') {
          bus.publish('OrderPaid', order.id);
        }
        return outcome.kind;
      }
    `,
    expect: { status: 'complete' },
  }),
];
