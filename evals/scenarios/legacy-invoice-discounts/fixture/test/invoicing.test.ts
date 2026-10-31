import { describe, expect, it, vi } from 'vitest';
import { main } from '../src/main/composition-root.js';
import { computeInvoice, printInvoice } from '../src/main/features/invoicing/index.js';

const widget = { name: 'Widget', qty: 2, unitCents: 1000 };

describe('computeInvoice', () => {
  it('totals a taxed order with flat shipping', () => {
    expect(computeInvoice({ items: [widget], customer: { country: 'US' } })).toEqual({
      lines: [
        '2 x Widget @ $10.00 = $20.00',
        'Subtotal: $20.00',
        'Shipping: $5.99',
        'Tax (8%): $1.60',
        'Total: $27.59',
      ],
      subtotalCents: 2000,
      shippingCents: 599,
      taxCents: 160,
      totalCents: 2759,
    });
  });

  it('ships free from $100.00', () => {
    const invoice = computeInvoice({
      items: [{ name: 'Desk', qty: 1, unitCents: 10000 }],
      customer: { country: 'GB' },
    });
    expect(invoice.shippingCents).toBe(0);
    expect(invoice.lines).toContain('Shipping: FREE');
    expect(invoice.totalCents).toBe(12000);
  });

  it('ships one cent under the threshold for a price', () => {
    const invoice = computeInvoice({
      items: [{ name: 'Desk', qty: 1, unitCents: 9999 }],
      customer: { country: 'GB' },
    });
    expect(invoice.shippingCents).toBe(599);
  });

  it('charges heavy shipping above 5000 grams', () => {
    const light = computeInvoice({
      items: [{ name: 'Rock', qty: 1, unitCents: 500, grams: 5000 }],
    });
    const heavy = computeInvoice({
      items: [{ name: 'Rock', qty: 2, unitCents: 500, grams: 2501 }],
    });
    expect(light.shippingCents).toBe(599);
    expect(heavy.shippingCents).toBe(1299);
  });

  it('charges no shipping for pickup', () => {
    const invoice = computeInvoice({ items: [widget], pickup: true });
    expect(invoice.shippingCents).toBe(0);
    expect(invoice.lines).toContain('Shipping: FREE');
  });

  it('charges no tax to an exempt customer', () => {
    const invoice = computeInvoice({
      items: [widget],
      customer: { country: 'DE', taxExempt: true },
    });
    expect(invoice.taxCents).toBe(0);
    expect(invoice.lines).toContain('Tax: exempt');
    expect(invoice.totalCents).toBe(2599);
  });

  it('uses the rate of the customer country', () => {
    const invoice = computeInvoice({ items: [widget], customer: { country: 'DE' } });
    expect(invoice.taxCents).toBe(380);
    expect(invoice.lines).toContain('Tax (19%): $3.80');
  });

  it('charges no tax in an unknown country or without a customer', () => {
    expect(computeInvoice({ items: [widget], customer: { country: 'FR' } }).taxCents).toBe(0);
    expect(computeInvoice({ items: [widget] }).lines).toContain('Tax (0%): $0.00');
  });

  it('rounds tax to the nearest cent', () => {
    const invoice = computeInvoice({
      items: [{ name: 'Pen', qty: 1, unitCents: 119 }],
      customer: { country: 'US' },
    });
    expect(invoice.taxCents).toBe(10);
  });

  it('rejects an order without items', () => {
    expect(() => computeInvoice({ items: [] })).toThrow('Invoice has no items');
    expect(() => computeInvoice({})).toThrow('Invoice has no items');
    expect(() => computeInvoice(undefined)).toThrow('Invoice has no items');
  });

  it('rejects a zero, negative or fractional quantity', () => {
    const rejectsQuantity = (qty: number) => {
      expect(() => computeInvoice({ items: [{ name: 'Pen', qty, unitCents: 100 }] })).toThrow(
        'Invalid quantity for Pen',
      );
    };
    rejectsQuantity(0);
    rejectsQuantity(-1);
    rejectsQuantity(1.5);
  });
});

describe('printInvoice', () => {
  it('writes one line per invoice line', () => {
    const written: string[] = [];
    printInvoice(
      { items: [widget], customer: { country: 'US' } },
      {
        write: (text) => {
          written.push(text);
        },
      },
    );
    expect(written).toEqual([
      '2 x Widget @ $10.00 = $20.00\n',
      'Subtotal: $20.00\n',
      'Shipping: $5.99\n',
      'Tax (8%): $1.60\n',
      'Total: $27.59\n',
    ]);
  });

  it('wires the invoice to standard output', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    main({ items: [widget], pickup: true });
    expect(write).toHaveBeenCalledWith('Total: $20.00\n');
    write.mockRestore();
  });
});
