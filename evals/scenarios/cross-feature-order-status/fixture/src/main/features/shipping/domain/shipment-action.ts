import type { Order, OrderStatus } from '../../orders/index.js';

function shipmentAction(status: OrderStatus): 'ship' | 'wait' | 'none' {
  switch (status) {
    case 'pending':
      return 'wait';
    case 'paid':
      return 'ship';
    case 'shipped':
    case 'cancelled':
      return 'none';
  }
}

export function selectToShip(orders: readonly Order[]): readonly Order[] {
  return orders.filter((order) => shipmentAction(order.status) === 'ship');
}
