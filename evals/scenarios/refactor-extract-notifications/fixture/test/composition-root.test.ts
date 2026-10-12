import { afterEach, describe, expect, it, vi } from 'vitest';
import { ordersMain, subscriptionsMain } from '../src/main/composition-root.js';

function capture(run: () => void): string {
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  run();
  return write.mock.calls.map(([chunk]) => String(chunk)).join('');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('composition root', () => {
  it('prints the receipts and reminders of the seeded orders', () => {
    expect(
      capture(() => {
        ordersMain('2026-03-08T09:00:00Z');
      }),
    ).toBe(
      [
        '{"channel":"email","to":"ada@example.com","subject":"Receipt: Order #1001","body":"Hi Ada Lovelace,\\n\\n2 x Notebook @ $4.50 = $9.00\\n1 x Pen set @ $12.00 = $12.00\\nShipping: $3.99\\nPlaced on 5 Mar 2026\\n\\nTotal: $24.99\\nIssued 8 Mar 2026\\n"}',
        '{"channel":"email","to":"ada@example.com","subject":"Reminder: Order #1001 awaiting payment","body":"Hi Ada Lovelace,\\n\\nPlease pay $24.99 to keep your order.\\n\\nDue 12 Mar 2026\\nSent 8 Mar 2026\\n"}',
        '{"channel":"sms","to":"+15550100","text":"Order #1002: total $49.05 (8 Mar 2026)"}',
        '{"channel":"sms","to":"+15550100","text":"Order #1002 awaiting payment: Please pay $49.05 to keep your order. (due 13 Mar 2026)"}',
        '{"channel":"email","to":"alan@example.com","subject":"Receipt: Order #1003","body":"Hi Alan Turing,\\n\\n12 x Bookmark @ $0.75 = $9.00\\nShipping: $2.50\\nPlaced on 7 Mar 2026\\n\\nTotal: $11.50\\nIssued 8 Mar 2026\\n"}',
        '{"channel":"email","to":"alan@example.com","subject":"Reminder: Order #1003 awaiting payment","body":"Hi Alan Turing,\\n\\nPlease pay $11.50 to keep your order.\\n\\nDue 14 Mar 2026\\nSent 8 Mar 2026\\n"}',
        '',
      ].join('\n'),
    );
  });

  it('prints the receipts and reminders of the seeded subscriptions', () => {
    expect(
      capture(() => {
        subscriptionsMain('2026-03-25T09:00:00Z');
      }),
    ).toBe(
      [
        '{"channel":"email","to":"grace@example.com","subject":"Receipt: Team plan renewal","body":"Hi Grace Hopper,\\n\\nPlan: Team (monthly)\\nSeats: 5 x $12.00\\nNext renewal: 31 Mar 2026\\n\\nTotal: $60.00\\nIssued 25 Mar 2026\\n"}',
        '{"channel":"email","to":"grace@example.com","subject":"Reminder: Team plan renews soon","body":"Hi Grace Hopper,\\n\\nYour Team plan renews for $60.00.\\n\\nDue 31 Mar 2026\\nSent 25 Mar 2026\\n"}',
        '{"channel":"sms","to":"+15550142","text":"Pro plan renewal: total $99.50 (25 Mar 2026)"}',
        '{"channel":"sms","to":"+15550142","text":"Pro plan renews soon: Your Pro plan renews for $99.50. (due 11 Apr 2026)"}',
        '',
      ].join('\n'),
    );
  });
});
