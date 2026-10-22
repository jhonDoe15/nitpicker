const SUCCESS = { name: 'success', result: 'success' };
const FAILURE = { name: 'failure', result: 'failure' };
const AMBIGUOUS = { name: 'ambiguous', result: 'ambiguous' };

export const ORDER_CONTRACTS = Object.freeze({
  effects: {
    'db.commit': { entity: { arg: 0, field: 'id' }, outcomes: [SUCCESS, FAILURE, AMBIGUOUS] },
    'bus.publish': { entity: { arg: 1 }, event: { arg: 0 }, outcomes: [SUCCESS, FAILURE] },
  },
  pure: ['Error'],
  transitions: [
    {
      id: 'order-status',
      effect: 'db.commit',
      from: { arg: 0, field: 'status' },
      to: { arg: 1 },
      allowed: [
        ['pending', 'paid'],
        ['pending', 'cancelled'],
        ['paid', 'refunded'],
      ],
    },
  ],
  prerequisites: [
    {
      id: 'paid-before-publish',
      effect: 'bus.publish',
      event: 'OrderPaid',
      requires: { effect: 'db.commit', to: 'paid' },
    },
  ],
});

const STATUS = { oneOf: ['pending', 'paid', 'cancelled'] };
const FLAG = { oneOf: [true, false] };

export const ORDER_INPUTS = Object.freeze({
  order: { id: 'A', status: STATUS },
  other: { id: 'B', status: STATUS },
  flag: FLAG,
  retry: FLAG,
  method: { oneOf: ['commit'] },
  items: 'object',
  db: 'effects',
  bus: 'effects',
});

export const PAID_A = 'paid-before-publish|bus.publish|A';

export function transition(entity, from, to) {
  return `order-status|db.commit|${entity}|${from}|${to}`;
}
