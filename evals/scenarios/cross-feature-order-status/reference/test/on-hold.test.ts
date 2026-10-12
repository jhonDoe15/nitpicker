import { describe, expect, it } from 'vitest';
import {
  dueTotalCents,
  printStatement,
  statementLine,
} from '../src/main/features/invoicing/index.js';
import type { Invoice } from '../src/main/features/invoicing/index.js';
import {
  placeOnHold,
  releaseFromHold,
  statusLabel,
  transition,
} from '../src/main/features/orders/index.js';
import type { Order } from '../src/main/features/orders/index.js';
import {
  selectToShip,
  shipOrders,
  summarizeShipping,
} from '../src/main/features/shipping/index.js';

const order = (status: Order['status']): Order => ({ id: 'O-1', status, totalCents: 2500 });
const held: Order = { id: 'O-1', status: 'on-hold', totalCents: 2500, holdReason: 'Fraud check' };

describe('orders on hold', () => {
  it('labels the status', () => {
    expect(statusLabel('on-hold')).toBe('On hold');
  });

  it('places a paid order on hold with the trimmed reason', () => {
    expect(placeOnHold(order('paid'), '  Fraud check ')).toEqual({ kind: 'moved', order: held });
  });

  it.each(['pending', 'shipped', 'cancelled', 'on-hold'] as const)(
    'rejects holding a %s order',
    (status) => {
      expect(placeOnHold(order(status), 'Fraud check')).toEqual({
        kind: 'rejected',
        from: status,
        to: 'on-hold',
      });
    },
  );

  it.each(['', '   '])('rejects the blank reason %j', (reason) => {
    expect(placeOnHold(order('paid'), reason)).toEqual({ kind: 'blank-reason' });
  });

  it('checks the status before the reason', () => {
    expect(placeOnHold(order('pending'), '')).toEqual({
      kind: 'rejected',
      from: 'pending',
      to: 'on-hold',
    });
  });

  it('releases a held order to paid without a reason', () => {
    const result = releaseFromHold(held);
    expect(result).toStrictEqual({ kind: 'moved', order: order('paid') });
  });

  it.each(['pending', 'paid', 'shipped', 'cancelled'] as const)(
    'rejects releasing a %s order',
    (status) => {
      expect(releaseFromHold(order(status))).toEqual({
        kind: 'rejected',
        from: status,
        to: 'paid',
      });
    },
  );

  it.each(['pending', 'paid', 'shipped', 'cancelled', 'on-hold'] as const)(
    'does not move to or from on hold with transition (%s)',
    (target) => {
      expect(transition(held, target)).toEqual({ kind: 'rejected', from: 'on-hold', to: target });
      expect(transition(order('paid'), 'on-hold')).toEqual({
        kind: 'rejected',
        from: 'paid',
        to: 'on-hold',
      });
    },
  );
});

describe('shipping with orders on hold', () => {
  const orders: readonly Order[] = [
    order('paid'),
    { ...held, id: 'O-2' },
    { ...order('paid'), id: 'O-3' },
    { ...held, id: 'O-4' },
  ];

  it('does not select held orders to ship', () => {
    expect(selectToShip(orders).map((selected) => selected.id)).toEqual(['O-1', 'O-3']);
  });

  it('does not send held orders to the carrier', () => {
    const sent: string[] = [];
    const ids = shipOrders(orders, {
      send: (sentOrder) => {
        sent.push(sentOrder.id);
      },
    });
    expect(ids).toEqual(['O-1', 'O-3']);
    expect(sent).toEqual(['O-1', 'O-3']);
  });

  it('reports held orders last in the summary', () => {
    const all = [...orders, { ...order('pending'), id: 'O-5' }, { ...order('shipped'), id: 'O-6' }];
    expect(summarizeShipping(all, '2026-03-31')).toBe(
      'Shipping summary for 2026-03-31: 2 to ship, 1 waiting for payment, 1 shipped, 2 on hold',
    );
  });

  it('reports a day with only held orders', () => {
    expect(summarizeShipping([held], '2026-03-31')).toBe(
      'Shipping summary for 2026-03-31: 1 on hold',
    );
  });

  it('leaves the summary alone when nothing is held', () => {
    expect(summarizeShipping([order('paid')], '2026-03-31')).toBe(
      'Shipping summary for 2026-03-31: 1 to ship',
    );
  });
});

describe('invoicing with orders on hold', () => {
  const heldInvoice: Invoice = { number: 'INV-2', orderStatus: 'on-hold', amountCents: 1999 };
  const openInvoice: Invoice = { number: 'INV-1', orderStatus: 'pending', amountCents: 2500 };
  const billedInvoice: Invoice = { number: 'INV-3', orderStatus: 'paid', amountCents: 1000 };
  const invoices: readonly Invoice[] = [openInvoice, heldInvoice, billedInvoice];

  it('marks a held invoice HELD', () => {
    expect(statementLine(heldInvoice)).toBe('INV-2 [HELD] $19.99');
  });

  it('leaves held invoices out of the due total', () => {
    expect(dueTotalCents(invoices)).toBe(3500);
  });

  it('prints held invoices and a due total without them', () => {
    const written: string[] = [];
    printStatement(invoices, {
      write: (text) => {
        written.push(text);
      },
    });
    expect(written).toEqual([
      'INV-1 [OPEN] $25.00\n',
      'INV-2 [HELD] $19.99\n',
      'INV-3 [BILLED] $10.00\n',
      'Due: $35.00\n',
    ]);
  });
});
