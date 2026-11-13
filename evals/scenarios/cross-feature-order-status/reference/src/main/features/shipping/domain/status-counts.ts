import type { Order, OrderStatus } from '../../orders/index.js';

type StatusCounts = Readonly<Record<OrderStatus, number>>;

export function countByStatus(orders: readonly Order[]): StatusCounts {
  function count(status: OrderStatus): number {
    return orders.filter((order) => order.status === status).length;
  }
  return {
    pending: count('pending'),
    paid: count('paid'),
    shipped: count('shipped'),
    cancelled: count('cancelled'),
    'on-hold': count('on-hold'),
  };
}
