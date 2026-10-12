import type { Order } from '../../orders/index.js';

// Daily summary line for the dispatch board.
export function summarizeShipping(orders: readonly Order[], date: string): string {
  if (orders.length === 0) {
    return 'Shipping summary for ' + date + ': no orders';
  }
  let toShip = 0;
  let waiting = 0;
  let shipped = 0;
  let cancelled = 0;
  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    if (order === undefined) {
      continue;
    }
    switch (order.status) {
      case 'pending':
        waiting++;
        break;
      case 'paid':
        toShip++;
        break;
      case 'shipped':
        shipped++;
        break;
      case 'cancelled':
        cancelled++;
        break;
    }
  }
  const parts: string[] = [];
  if (toShip > 0) {
    if (toShip >= 10) {
      parts.push(toShip + ' to ship (busy)');
    } else {
      parts.push(toShip + ' to ship');
    }
  }
  if (waiting > 0) {
    if (waiting > toShip) {
      parts.push(waiting + ' waiting for payment (backlog)');
    } else {
      parts.push(waiting + ' waiting for payment');
    }
  }
  if (shipped > 0) {
    parts.push(shipped + ' shipped');
  }
  if (cancelled > 0) {
    if (cancelled > shipped && cancelled > 1) {
      parts.push(cancelled + ' cancelled (check)');
    } else {
      parts.push(cancelled + ' cancelled');
    }
  }
  return 'Shipping summary for ' + date + ': ' + parts.join(', ');
}
