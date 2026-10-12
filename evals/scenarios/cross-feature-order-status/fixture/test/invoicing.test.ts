import { describe, expect, it } from 'vitest';
import {
  dueTotalCents,
  printStatement,
  statementLine,
} from '../src/main/features/invoicing/index.js';
import type { Invoice } from '../src/main/features/invoicing/index.js';

const invoice = (
  number: string,
  orderStatus: Invoice['orderStatus'],
  amountCents: number,
): Invoice => ({
  number,
  orderStatus,
  amountCents,
});

const invoices: readonly Invoice[] = [
  invoice('INV-1', 'pending', 2500),
  invoice('INV-2', 'paid', 1999),
  invoice('INV-3', 'shipped', 12050),
  invoice('INV-4', 'cancelled', 800),
];

describe('statementLine', () => {
  it.each([
    ['pending', 'INV-1 [OPEN] $25.00'],
    ['paid', 'INV-1 [BILLED] $25.00'],
    ['shipped', 'INV-1 [SETTLED] $25.00'],
    ['cancelled', 'INV-1 [VOID] $25.00'],
  ] as const)('marks a %s invoice', (status, line) => {
    expect(statementLine(invoice('INV-1', status, 2500))).toBe(line);
  });

  it('pads cents', () => {
    expect(statementLine(invoice('INV-9', 'pending', 305))).toBe('INV-9 [OPEN] $3.05');
  });
});

describe('dueTotalCents', () => {
  it('adds up pending and paid invoices only', () => {
    expect(dueTotalCents(invoices)).toBe(4499);
  });

  it('is zero with nothing due', () => {
    expect(dueTotalCents([invoice('INV-3', 'shipped', 12050)])).toBe(0);
  });
});

describe('printStatement', () => {
  it('writes a line per invoice and the due total', () => {
    const written: string[] = [];
    printStatement(invoices, {
      write: (text) => {
        written.push(text);
      },
    });
    expect(written).toEqual([
      'INV-1 [OPEN] $25.00\n',
      'INV-2 [BILLED] $19.99\n',
      'INV-3 [SETTLED] $120.50\n',
      'INV-4 [VOID] $8.00\n',
      'Due: $44.99\n',
    ]);
  });
});
