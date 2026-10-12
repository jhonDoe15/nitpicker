import type { Order } from './order.js';
import type { TransitionResult } from './transition.js';

export function placeOnHold(order: Order, reason: string): TransitionResult {
  if (order.status !== 'paid') {
    return { kind: 'rejected', from: order.status, to: 'on-hold' };
  }
  const holdReason = reason.trim();
  if (holdReason === '') {
    return { kind: 'blank-reason' };
  }
  return { kind: 'moved', order: { ...order, status: 'on-hold', holdReason } };
}

export function releaseFromHold(order: Order): TransitionResult {
  if (order.status !== 'on-hold') {
    return { kind: 'rejected', from: order.status, to: 'paid' };
  }
  return {
    kind: 'moved',
    order: { id: order.id, status: 'paid', totalCents: order.totalCents },
  };
}
