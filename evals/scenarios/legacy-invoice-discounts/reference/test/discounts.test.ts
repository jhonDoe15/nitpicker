import { describe, expect, it } from 'vitest';
import { computeInvoice, printInvoice } from '../src/main/features/invoicing/index.js';

const widget = { name: 'Widget', qty: 2, unitCents: 1000 };
const us = { country: 'US' };

describe('no discount code', () => {
  it('leaves an invoice without codes as it was, with a zero discount', () => {
    expect(computeInvoice({ items: [widget], customer: us })).toEqual({
      lines: [
        '2 x Widget @ $10.00 = $20.00',
        'Subtotal: $20.00',
        'Shipping: $5.99',
        'Tax (8%): $1.60',
        'Total: $27.59',
      ],
      subtotalCents: 2000,
      discountCents: 0,
      shippingCents: 599,
      taxCents: 160,
      totalCents: 2759,
    });
  });

  it('treats an empty code list as no code', () => {
    expect(computeInvoice({ items: [widget], customer: us, discountCodes: [] })).toEqual(
      computeInvoice({ items: [widget], customer: us }),
    );
  });

  it('keeps the existing shipping, tax and error behavior', () => {
    const heavy = computeInvoice({
      items: [{ name: 'Rock', qty: 2, unitCents: 500, grams: 2501 }],
    });
    expect(heavy.shippingCents).toBe(1299);
    expect(computeInvoice({ items: [widget], pickup: true }).lines).toEqual([
      '2 x Widget @ $10.00 = $20.00',
      'Subtotal: $20.00',
      'Shipping: FREE',
      'Tax (0%): $0.00',
      'Total: $20.00',
    ]);
    expect(
      computeInvoice({ items: [widget], customer: { country: 'DE', taxExempt: true } }).lines,
    ).toEqual([
      '2 x Widget @ $10.00 = $20.00',
      'Subtotal: $20.00',
      'Shipping: $5.99',
      'Tax: exempt',
      'Total: $25.99',
    ]);
    expect(computeInvoice({ items: [widget], customer: { country: 'DE' } }).taxCents).toBe(380);
    expect(() => computeInvoice({ items: [] })).toThrow('Invoice has no items');
    expect(() => computeInvoice({ items: [{ name: 'Pen', qty: 0, unitCents: 1 }] })).toThrow(
      'Invalid quantity for Pen',
    );
  });
});

describe('percentage codes', () => {
  it('takes 10 percent off before tax', () => {
    expect(computeInvoice({ items: [widget], customer: us, discountCodes: ['SAVE10'] })).toEqual({
      lines: [
        '2 x Widget @ $10.00 = $20.00',
        'Subtotal: $20.00',
        'Discount SAVE10: -$2.00',
        'Shipping: $5.99',
        'Tax (8%): $1.44',
        'Total: $25.43',
      ],
      subtotalCents: 2000,
      discountCents: 200,
      shippingCents: 599,
      taxCents: 144,
      totalCents: 2543,
    });
  });

  it('matches the code case-insensitively and prints it in upper case', () => {
    const upper = computeInvoice({ items: [widget], customer: us, discountCodes: ['SAVE10'] });
    expect(computeInvoice({ items: [widget], customer: us, discountCodes: ['save10'] })).toEqual(
      upper,
    );
    expect(
      computeInvoice({ items: [widget], customer: us, discountCodes: ['SaVe10'] }).lines,
    ).toEqual([
      '2 x Widget @ $10.00 = $20.00',
      'Subtotal: $20.00',
      'Discount SAVE10: -$2.00',
      'Shipping: $5.99',
      'Tax (8%): $1.44',
      'Total: $25.43',
    ]);
  });

  it('rounds a percentage discount down to the cent', () => {
    const invoice = computeInvoice({
      items: [{ name: 'Pen', qty: 1, unitCents: 999 }],
      customer: us,
      discountCodes: ['SAVE10'],
    });
    expect(invoice.discountCents).toBe(99);
    expect(invoice.lines).toEqual([
      '1 x Pen @ $9.99 = $9.99',
      'Subtotal: $9.99',
      'Discount SAVE10: -$0.99',
      'Shipping: $5.99',
      'Tax (8%): $0.72',
      'Total: $15.71',
    ]);
    expect(invoice.taxCents).toBe(72);
    expect(invoice.totalCents).toBe(1571);
  });

  it('takes 25 percent off and rounds down', () => {
    const invoice = computeInvoice({
      items: [{ name: 'Mug', qty: 3, unitCents: 1333 }],
      customer: { country: 'DE' },
      discountCodes: ['save25'],
    });
    expect(invoice.lines).toEqual([
      '3 x Mug @ $13.33 = $39.99',
      'Subtotal: $39.99',
      'Discount SAVE25: -$9.99',
      'Shipping: $5.99',
      'Tax (19%): $5.70',
      'Total: $41.69',
    ]);
    expect(invoice.discountCents).toBe(999);
    expect(invoice.totalCents).toBe(4169);
  });
});

describe('fixed-amount codes', () => {
  it('takes the amount off before tax', () => {
    const invoice = computeInvoice({ items: [widget], customer: us, discountCodes: ['FIVEOFF'] });
    expect(invoice).toEqual({
      lines: [
        '2 x Widget @ $10.00 = $20.00',
        'Subtotal: $20.00',
        'Discount FIVEOFF: -$5.00',
        'Shipping: $5.99',
        'Tax (8%): $1.20',
        'Total: $22.19',
      ],
      subtotalCents: 2000,
      discountCents: 500,
      shippingCents: 599,
      taxCents: 120,
      totalCents: 2219,
    });
  });

  it('matches a fixed code case-insensitively', () => {
    const invoice = computeInvoice({ items: [widget], customer: us, discountCodes: ['fiveoff'] });
    expect(invoice.lines).toEqual([
      '2 x Widget @ $10.00 = $20.00',
      'Subtotal: $20.00',
      'Discount FIVEOFF: -$5.00',
      'Shipping: $5.99',
      'Tax (8%): $1.20',
      'Total: $22.19',
    ]);
  });

  it('never takes more than the item subtotal', () => {
    const invoice = computeInvoice({
      items: [{ name: 'Pen', qty: 1, unitCents: 300 }],
      customer: us,
      discountCodes: ['FIVEOFF'],
    });
    expect(invoice.lines).toEqual([
      '1 x Pen @ $3.00 = $3.00',
      'Subtotal: $3.00',
      'Discount FIVEOFF: -$3.00',
      'Shipping: $5.99',
      'Tax (8%): $0.00',
      'Total: $5.99',
    ]);
    expect(invoice.discountCents).toBe(300);
    expect(invoice.taxCents).toBe(0);
    expect(invoice.totalCents).toBe(599);
  });

  it('takes exactly the subtotal when the code is worth the same', () => {
    const invoice = computeInvoice({
      items: [{ name: 'Pen', qty: 2, unitCents: 1000 }],
      pickup: true,
      discountCodes: ['TWENTY'],
    });
    expect(invoice.discountCents).toBe(2000);
    expect(invoice.totalCents).toBe(0);
    expect(invoice.lines).toEqual([
      '2 x Pen @ $10.00 = $20.00',
      'Subtotal: $20.00',
      'Discount TWENTY: -$20.00',
      'Shipping: FREE',
      'Tax (0%): $0.00',
      'Total: $0.00',
    ]);
  });

  it('applies a fixed code to a tax-exempt customer', () => {
    const invoice = computeInvoice({
      items: [widget],
      customer: { country: 'DE', taxExempt: true },
      discountCodes: ['TWENTY'],
    });
    expect(invoice.lines).toEqual([
      '2 x Widget @ $10.00 = $20.00',
      'Subtotal: $20.00',
      'Discount TWENTY: -$20.00',
      'Shipping: $5.99',
      'Tax: exempt',
      'Total: $5.99',
    ]);
    expect(invoice.totalCents).toBe(599);
  });
});

describe('shipping ignores the code', () => {
  it('keeps free shipping decided from the subtotal before the discount', () => {
    const invoice = computeInvoice({
      items: [{ name: 'Desk', qty: 1, unitCents: 10000 }],
      customer: us,
      discountCodes: ['SAVE10'],
    });
    expect(invoice.shippingCents).toBe(0);
    expect(invoice.lines).toEqual([
      '1 x Desk @ $100.00 = $100.00',
      'Subtotal: $100.00',
      'Discount SAVE10: -$10.00',
      'Shipping: FREE',
      'Tax (8%): $7.20',
      'Total: $97.20',
    ]);
    expect(invoice.discountCents).toBe(1000);
    expect(invoice.taxCents).toBe(720);
    expect(invoice.totalCents).toBe(9720);
  });

  it('does not make shipping free because the discount is large', () => {
    const invoice = computeInvoice({
      items: [{ name: 'Desk', qty: 1, unitCents: 9999 }],
      discountCodes: ['SAVE25'],
    });
    expect(invoice.shippingCents).toBe(599);
  });

  it('charges heavy shipping on a discounted heavy order', () => {
    const invoice = computeInvoice({
      items: [{ name: 'Rock', qty: 2, unitCents: 500, grams: 2501 }],
      discountCodes: ['SAVE10'],
    });
    expect(invoice.shippingCents).toBe(1299);
  });
});

describe('unknown codes', () => {
  it('reports an unknown code as given and computes the invoice without it', () => {
    const plain = computeInvoice({ items: [widget], customer: us });
    const invoice = computeInvoice({ items: [widget], customer: us, discountCodes: ['bogus'] });
    expect(invoice.lines).toEqual([
      '2 x Widget @ $10.00 = $20.00',
      'Subtotal: $20.00',
      'Unknown discount code: bogus',
      'Shipping: $5.99',
      'Tax (8%): $1.60',
      'Total: $27.59',
    ]);
    expect(invoice.discountCents).toBe(0);
    expect(invoice.totalCents).toBe(plain.totalCents);
  });

  it.each(['constructor', '__proto__', 'toString'])(
    'does not treat the object property name %s as a known code',
    (code) => {
      const invoice = computeInvoice({ items: [widget], discountCodes: [code] });
      expect(invoice.lines).toEqual([
        '2 x Widget @ $10.00 = $20.00',
        'Subtotal: $20.00',
        `Unknown discount code: ${code}`,
        'Shipping: $5.99',
        'Tax (0%): $0.00',
        'Total: $25.99',
      ]);
      expect(invoice.discountCents).toBe(0);
    },
  );

  it('does not treat a near miss as a known code', () => {
    const invoice = computeInvoice({ items: [widget], discountCodes: ['SAVE1'] });
    expect(invoice.lines).toEqual([
      '2 x Widget @ $10.00 = $20.00',
      'Subtotal: $20.00',
      'Unknown discount code: SAVE1',
      'Shipping: $5.99',
      'Tax (0%): $0.00',
      'Total: $25.99',
    ]);
    expect(invoice.discountCents).toBe(0);
  });
});

describe('at most one code', () => {
  it('applies none of two known codes and says so', () => {
    const invoice = computeInvoice({
      items: [widget],
      customer: us,
      discountCodes: ['SAVE10', 'FIVEOFF'],
    });
    expect(invoice.lines).toEqual([
      '2 x Widget @ $10.00 = $20.00',
      'Subtotal: $20.00',
      'Only one discount code per invoice',
      'Shipping: $5.99',
      'Tax (8%): $1.60',
      'Total: $27.59',
    ]);
    expect(invoice.discountCents).toBe(0);
    expect(invoice.totalCents).toBe(2759);
  });

  it('counts a repeated code and an unknown one as more than one', () => {
    const repeated = computeInvoice({ items: [widget], discountCodes: ['SAVE10', 'save10'] });
    const mixed = computeInvoice({ items: [widget], discountCodes: ['bogus', 'SAVE10'] });
    for (const invoice of [repeated, mixed]) {
      expect(invoice.lines).toEqual([
        '2 x Widget @ $10.00 = $20.00',
        'Subtotal: $20.00',
        'Only one discount code per invoice',
        'Shipping: $5.99',
        'Tax (0%): $0.00',
        'Total: $25.99',
      ]);
      expect(invoice.discountCents).toBe(0);
    }
  });
});

describe('errors and printing', () => {
  it('still rejects an order without items when a code is given', () => {
    expect(() => computeInvoice({ items: [], discountCodes: ['SAVE10'] })).toThrow(
      'Invoice has no items',
    );
  });

  it('prints the discount line', () => {
    const written: string[] = [];
    printInvoice(
      { items: [widget], customer: us, discountCodes: ['save10'] },
      {
        write: (text) => {
          written.push(text);
        },
      },
    );
    expect(written).toEqual([
      '2 x Widget @ $10.00 = $20.00\n',
      'Subtotal: $20.00\n',
      'Discount SAVE10: -$2.00\n',
      'Shipping: $5.99\n',
      'Tax (8%): $1.44\n',
      'Total: $25.43\n',
    ]);
  });
});

describe('odd orders', () => {
  it('ignores a null customer and a discountCodes value that is not a list', () => {
    const plain = computeInvoice({ items: [widget] });
    expect(computeInvoice({ items: [widget], customer: null })).toEqual(plain);
    expect(computeInvoice({ items: [widget], discountCodes: 'SAVE10' })).toEqual(plain);
  });
});
