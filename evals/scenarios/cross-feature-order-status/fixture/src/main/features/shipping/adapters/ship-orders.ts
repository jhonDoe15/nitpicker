import type { Order } from '../../orders/index.js';
import { selectToShip } from '../domain/shipment-action.js';

type Carrier = { readonly send: (order: Order) => void };

export function shipOrders(orders: readonly Order[], carrier: Carrier): readonly string[] {
  const sent: string[] = [];
  for (const order of selectToShip(orders)) {
    carrier.send(order);
    sent.push(order.id);
  }
  return sent;
}
