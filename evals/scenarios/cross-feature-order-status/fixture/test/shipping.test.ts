import { describe, expect, it } from 'vitest';
import type { Order } from '../src/main/features/orders/index.js';
import {
  selectToShip,
  shipOrders,
  summarizeShipping,
} from '../src/main/features/shipping/index.js';

const order = (id: string, status: Order['status']): Order => ({ id, status, totalCents: 1000 });

const mixed: readonly Order[] = [
  order('O-1', 'pending'),
  order('O-2', 'paid'),
  order('O-3', 'shipped'),
  order('O-4', 'cancelled'),
  order('O-5', 'paid'),
];

describe('selectToShip', () => {
  it('keeps only paid orders, in order', () => {
    expect(selectToShip(mixed)).toEqual([order('O-2', 'paid'), order('O-5', 'paid')]);
  });
});

describe('shipOrders', () => {
  it('sends every paid order to the carrier and returns their ids', () => {
    const sent: string[] = [];
    const ids = shipOrders(mixed, {
      send: (sentOrder) => {
        sent.push(sentOrder.id);
      },
    });
    expect(ids).toEqual(['O-2', 'O-5']);
    expect(sent).toEqual(['O-2', 'O-5']);
  });
});

describe('summarizeShipping', () => {
  it('reports no orders', () => {
    expect(summarizeShipping([], '2026-03-31')).toBe('Shipping summary for 2026-03-31: no orders');
  });

  it('counts each status and omits zero counts', () => {
    expect(summarizeShipping(mixed, '2026-03-31')).toBe(
      'Shipping summary for 2026-03-31: 2 to ship, 1 waiting for payment, 1 shipped, 1 cancelled',
    );
    expect(summarizeShipping([order('O-1', 'shipped')], '2026-04-01')).toBe(
      'Shipping summary for 2026-04-01: 1 shipped',
    );
  });

  it('flags a busy day', () => {
    const busy = Array.from({ length: 10 }, (_, index) => order(`P-${String(index)}`, 'paid'));
    expect(summarizeShipping(busy, '2026-03-31')).toBe(
      'Shipping summary for 2026-03-31: 10 to ship (busy)',
    );
  });

  it('flags a payment backlog and a cancellation spike', () => {
    const pile = [
      order('O-1', 'pending'),
      order('O-2', 'pending'),
      order('O-3', 'cancelled'),
      order('O-4', 'cancelled'),
    ];
    expect(summarizeShipping(pile, '2026-03-31')).toBe(
      'Shipping summary for 2026-03-31: 2 waiting for payment (backlog), 2 cancelled (check)',
    );
  });
});
