import type { Order, OrderStatus } from '../../orders/index.js';

type StatusCounts = Readonly<Record<OrderStatus, number>>;

export function countByStatus(orders: readonly Order[]): StatusCounts {
  return orders.reduce<StatusCounts>(
    (counts: StatusCounts, order): StatusCounts => ({
      ...counts,
      [order.status]: counts[order.status] + 1,
    }),
    { pending: 0, paid: 0, shipped: 0, cancelled: 0, 'on-hold': 0 },
  );
}
