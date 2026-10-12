import type { Order } from '../../orders/index.js';
import { countByStatus } from './status-counts.js';
import { onHoldParts } from './summary-parts.js';

// Daily summary line for the dispatch board.
export function summarizeShipping(orders: readonly Order[], date: string): string {
  if (orders.length === 0) {
    return 'Shipping summary for ' + date + ': no orders';
  }
  const counts = countByStatus(orders);
  const toShip = counts.paid;
  const waiting = counts.pending;
  const shipped = counts.shipped;
  const cancelled = counts.cancelled;
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
  return (
    'Shipping summary for ' + date + ': ' + [...parts, ...onHoldParts(counts['on-hold'])].join(', ')
  );
}
