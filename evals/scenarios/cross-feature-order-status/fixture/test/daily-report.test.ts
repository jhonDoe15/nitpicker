import { describe, expect, it, vi } from 'vitest';
import { dailyReportMain } from '../src/main/composition-root.js';

describe('dailyReportMain', () => {
  it('writes order labels, the shipping summary and the statement', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    dailyReportMain('2026-03-31');
    expect(write.mock.calls.map(([text]) => text)).toEqual([
      'O-1: Pending\n',
      'O-2: Paid\n',
      'O-3: Shipped\n',
      'O-4: Cancelled\n',
      'Shipping summary for 2026-03-31: 1 to ship, 1 waiting for payment, 1 shipped, 1 cancelled\n',
      'INV-1 [OPEN] $25.00\n',
      'INV-2 [BILLED] $19.99\n',
      'INV-3 [SETTLED] $120.50\n',
      'INV-4 [VOID] $8.00\n',
      'Due: $44.99\n',
    ]);
  });
});
