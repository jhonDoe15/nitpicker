import { describe, expect, it } from 'vitest';
import {
  dueTotalCents,
  printStatement,
  statementLine,
} from '../src/main/features/invoicing/index.js';
import {
  placeOnHold,
  releaseFromHold,
  statusLabel,
  transition,
} from '../src/main/features/orders/index.js';
import {
  selectToShip,
  shipOrders,
  summarizeShipping,
} from '../src/main/features/shipping/index.js';

const statuses = ['pending', 'paid', 'shipped', 'cancelled', 'on-hold'] as const;
const plain = (status: string, id = 'O-1') => ({ id, status, totalCents: 2500 });
const held = (id = 'O-1', holdReason = 'Fraud check') => ({
  id,
  status: 'on-hold',
  totalCents: 2500,
  holdReason,
});

describe('orders', () => {
  it('keeps the existing labels and adds On hold', () => {
    expect(statuses.map((status) => statusLabel(status))).toEqual([
      'Pending',
      'Paid',
      'Shipped',
      'Cancelled',
      'On hold',
    ]);
  });

  it('places a paid order on hold with the trimmed reason', () => {
    expect(placeOnHold(plain('paid') as never, '  Fraud check \n')).toEqual({
      kind: 'moved',
      order: held(),
    });
  });

  it('keeps the other fields and does not change the input order', () => {
    const paid = plain('paid', 'O-77');
    const result = placeOnHold(paid as never, 'Address check');
    expect(result).toEqual({ kind: 'moved', order: held('O-77', 'Address check') });
    expect(paid).toEqual({ id: 'O-77', status: 'paid', totalCents: 2500 });
  });

  it.each(['pending', 'shipped', 'cancelled', 'on-hold'])(
    'rejects holding a %s order, even with a blank reason',
    (status) => {
      const order = status === 'on-hold' ? held() : plain(status);
      const expected = { kind: 'rejected', from: status, to: 'on-hold' };
      expect(placeOnHold(order as never, 'Fraud check')).toEqual(expected);
      expect(placeOnHold(order as never, '  ')).toEqual(expected);
    },
  );

  it.each(['', ' ', '\t \n'])('rejects the blank reason %j on a paid order', (reason) => {
    expect(placeOnHold(plain('paid') as never, reason)).toEqual({ kind: 'blank-reason' });
  });

  it('releases a held order to a plain paid order', () => {
    const result = releaseFromHold(held() as never);
    expect(result).toStrictEqual({ kind: 'moved', order: plain('paid') });
  });

  it.each(['pending', 'paid', 'shipped', 'cancelled'])('rejects releasing a %s order', (status) => {
    expect(releaseFromHold(plain(status) as never)).toEqual({
      kind: 'rejected',
      from: status,
      to: 'paid',
    });
  });

  it('can hold, release and hold again', () => {
    const first = placeOnHold(plain('paid') as never, 'First');
    expect(first.kind).toBe('moved');
    const released = releaseFromHold((first as { order: never }).order);
    expect(released).toStrictEqual({ kind: 'moved', order: plain('paid') });
    expect(placeOnHold((released as { order: never }).order, 'Second')).toEqual({
      kind: 'moved',
      order: held('O-1', 'Second'),
    });
  });

  it.each(statuses)('never moves a held order to %s with transition', (to) => {
    expect(transition(held() as never, to)).toEqual({ kind: 'rejected', from: 'on-hold', to });
  });

  it.each(['pending', 'paid', 'shipped', 'cancelled'])(
    'never moves a %s order to on-hold with transition',
    (from) => {
      expect(transition(plain(from) as never, 'on-hold')).toEqual({
        kind: 'rejected',
        from,
        to: 'on-hold',
      });
    },
  );

  it('keeps the existing transitions', () => {
    expect(transition(plain('pending') as never, 'paid')).toEqual({
      kind: 'moved',
      order: plain('paid'),
    });
    expect(transition(plain('paid') as never, 'shipped')).toEqual({
      kind: 'moved',
      order: plain('shipped'),
    });
    expect(transition(plain('paid') as never, 'cancelled')).toEqual({
      kind: 'moved',
      order: plain('cancelled'),
    });
    expect(transition(plain('shipped') as never, 'cancelled')).toEqual({
      kind: 'rejected',
      from: 'shipped',
      to: 'cancelled',
    });
  });
});

describe('shipping', () => {
  const orders = [
    plain('paid', 'O-1'),
    held('O-2'),
    plain('pending', 'O-3'),
    plain('paid', 'O-4'),
    held('O-5', 'Address check'),
    plain('shipped', 'O-6'),
    plain('cancelled', 'O-7'),
  ] as never[];

  it('does not select held orders to ship', () => {
    expect(selectToShip(orders).map((order) => order.id)).toEqual(['O-1', 'O-4']);
  });

  it('never hands a held order to the carrier', () => {
    const sent: string[] = [];
    const ids = shipOrders(orders, {
      send: (order) => {
        sent.push(order.id);
      },
    });
    expect(ids).toEqual(['O-1', 'O-4']);
    expect(sent).toEqual(['O-1', 'O-4']);
  });

  it('ships nothing when every order is held', () => {
    const sent: string[] = [];
    const ids = shipOrders([held('O-1'), held('O-2')] as never[], {
      send: (order) => {
        sent.push(order.id);
      },
    });
    expect(ids).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('reports held orders last in the summary line', () => {
    expect(summarizeShipping(orders, '2026-03-31')).toBe(
      'Shipping summary for 2026-03-31: 2 to ship, 1 waiting for payment, 1 shipped, 1 cancelled, 2 on hold',
    );
  });

  it('reports a day with only held orders', () => {
    expect(summarizeShipping([held('O-1')] as never[], '2026-03-31')).toBe(
      'Shipping summary for 2026-03-31: 1 on hold',
    );
    expect(
      summarizeShipping([held('O-1'), held('O-2'), held('O-3')] as never[], '2026-04-02'),
    ).toBe('Shipping summary for 2026-04-02: 3 on hold');
  });

  it('places the held count after flagged counts too', () => {
    const busy = [
      ...Array.from({ length: 10 }, (_, index) => plain('paid', `P-${String(index)}`)),
      held('H-1'),
    ] as never[];
    expect(summarizeShipping(busy, '2026-03-31')).toBe(
      'Shipping summary for 2026-03-31: 10 to ship (busy), 1 on hold',
    );
  });

  it('leaves the other summary lines exactly as they were', () => {
    expect(summarizeShipping([], '2026-03-31')).toBe('Shipping summary for 2026-03-31: no orders');
    expect(
      summarizeShipping(
        [
          plain('paid'),
          plain('pending', 'O-2'),
          plain('shipped', 'O-3'),
          plain('cancelled', 'O-4'),
        ] as never[],
        '2026-03-31',
      ),
    ).toBe(
      'Shipping summary for 2026-03-31: 1 to ship, 1 waiting for payment, 1 shipped, 1 cancelled',
    );
    expect(
      summarizeShipping(
        [
          plain('pending'),
          plain('pending', 'O-2'),
          plain('cancelled', 'O-3'),
          plain('cancelled', 'O-4'),
        ] as never[],
        '2026-03-31',
      ),
    ).toBe('Shipping summary for 2026-03-31: 2 waiting for payment (backlog), 2 cancelled (check)');
  });
});

describe('invoicing', () => {
  const invoice = (number: string, orderStatus: string, amountCents: number) =>
    ({ number, orderStatus, amountCents }) as never;

  it('labels held and existing invoices', () => {
    expect(statementLine(invoice('INV-2', 'on-hold', 1999))).toBe('INV-2 [HELD] $19.99');
    expect(statementLine(invoice('INV-3', 'pending', 305))).toBe('INV-3 [OPEN] $3.05');
    expect(statementLine(invoice('INV-4', 'paid', 100))).toBe('INV-4 [BILLED] $1.00');
    expect(statementLine(invoice('INV-5', 'shipped', 12050))).toBe('INV-5 [SETTLED] $120.50');
    expect(statementLine(invoice('INV-6', 'cancelled', 800))).toBe('INV-6 [VOID] $8.00');
  });

  it('leaves held invoices out of the due total', () => {
    const invoices = [
      invoice('INV-1', 'pending', 2500),
      invoice('INV-2', 'on-hold', 1999),
      invoice('INV-3', 'paid', 1000),
      invoice('INV-4', 'shipped', 500),
      invoice('INV-5', 'on-hold', 7777),
    ] as never[];
    expect(dueTotalCents(invoices)).toBe(3500);
  });

  it('has nothing due when every invoice is held', () => {
    expect(dueTotalCents([invoice('INV-1', 'on-hold', 4200)] as never[])).toBe(0);
  });

  it('still lists held invoices in the statement, outside the Due line', () => {
    const written: string[] = [];
    printStatement(
      [
        invoice('INV-1', 'pending', 2500),
        invoice('INV-2', 'on-hold', 1999),
        invoice('INV-3', 'paid', 1000),
      ] as never[],
      {
        write: (text) => {
          written.push(text);
        },
      },
    );
    expect(written).toEqual([
      'INV-1 [OPEN] $25.00\n',
      'INV-2 [HELD] $19.99\n',
      'INV-3 [BILLED] $10.00\n',
      'Due: $35.00\n',
    ]);
  });
});
