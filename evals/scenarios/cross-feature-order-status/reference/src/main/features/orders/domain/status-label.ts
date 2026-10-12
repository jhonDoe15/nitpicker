import type { OrderStatus } from './order.js';

export function statusLabel(status: OrderStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'paid':
      return 'Paid';
    case 'shipped':
      return 'Shipped';
    case 'cancelled':
      return 'Cancelled';
    case 'on-hold':
      return 'On hold';
  }
}
