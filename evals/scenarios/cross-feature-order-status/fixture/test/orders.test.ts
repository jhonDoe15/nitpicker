import { describe, expect, it } from 'vitest';
import { statusLabel, transition } from '../src/main/features/orders/index.js';
import type { Order } from '../src/main/features/orders/index.js';

const order = (status: Order['status']): Order => ({ id: 'O-1', status, totalCents: 2500 });

describe('statusLabel', () => {
  it.each([
    ['pending', 'Pending'],
    ['paid', 'Paid'],
    ['shipped', 'Shipped'],
    ['cancelled', 'Cancelled'],
  ] as const)('labels %s as %s', (status, label) => {
    expect(statusLabel(status)).toBe(label);
  });
});

describe('transition', () => {
  it.each([
    ['pending', 'paid'],
    ['pending', 'cancelled'],
    ['paid', 'shipped'],
    ['paid', 'cancelled'],
  ] as const)('moves %s to %s', (from, to) => {
    expect(transition(order(from), to)).toEqual({ kind: 'moved', order: order(to) });
  });

  it.each([
    ['pending', 'shipped'],
    ['paid', 'pending'],
    ['shipped', 'cancelled'],
    ['cancelled', 'paid'],
  ] as const)('rejects %s to %s', (from, to) => {
    expect(transition(order(from), to)).toEqual({ kind: 'rejected', from, to });
  });
});
