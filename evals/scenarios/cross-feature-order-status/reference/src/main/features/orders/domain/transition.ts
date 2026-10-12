import type { Order, OrderStatus } from './order.js';

export type TransitionResult =
  | { readonly kind: 'moved'; readonly order: Order }
  | { readonly kind: 'rejected'; readonly from: OrderStatus; readonly to: OrderStatus }
  | { readonly kind: 'blank-reason' };

function nextStatuses(status: OrderStatus): readonly OrderStatus[] {
  switch (status) {
    case 'pending':
      return ['paid', 'cancelled'];
    case 'paid':
      return ['shipped', 'cancelled'];
    case 'shipped':
    case 'cancelled':
    case 'on-hold':
      return [];
  }
}

export function transition(order: Order, to: OrderStatus): TransitionResult {
  if (!nextStatuses(order.status).includes(to)) {
    return { kind: 'rejected', from: order.status, to };
  }
  return { kind: 'moved', order: { ...order, status: to } };
}
