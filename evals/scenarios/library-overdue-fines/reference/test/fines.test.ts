import { describe, expect, it, vi } from 'vitest';
import { overdueReportMain } from '../src/main/composition-root.js';
import { createInMemoryCatalog } from '../src/main/features/catalog/index.js';
import { fineCents, overdueReportLines } from '../src/main/features/fines/index.js';
import { createInMemoryLoans } from '../src/main/features/loans/index.js';
import type { Loan } from '../src/main/features/loans/index.js';
import { createInMemoryMembers } from '../src/main/features/members/index.js';

describe('fineCents', () => {
  it('charges the daily rate for each day late', () => {
    expect(fineCents({ dailyRateCents: 25, daysLate: 3, tier: 'standard' })).toBe(75);
    expect(fineCents({ dailyRateCents: 25, daysLate: 0, tier: 'standard' })).toBe(0);
  });

  it('halves the fine for students, rounding down', () => {
    expect(fineCents({ dailyRateCents: 25, daysLate: 3, tier: 'student' })).toBe(37);
    expect(fineCents({ dailyRateCents: 10, daysLate: 2, tier: 'student' })).toBe(10);
  });

  it('caps the fine at 20 days of the rate before any discount', () => {
    expect(fineCents({ dailyRateCents: 25, daysLate: 20, tier: 'standard' })).toBe(500);
    expect(fineCents({ dailyRateCents: 25, daysLate: 21, tier: 'standard' })).toBe(500);
    expect(fineCents({ dailyRateCents: 25, daysLate: 90, tier: 'student' })).toBe(250);
  });
});

const catalog = createInMemoryCatalog([
  { id: 'B1', title: 'Dune', category: 'novel' },
  { id: 'B2', title: 'World Atlas', category: 'reference' },
]);
const members = createInMemoryMembers([
  { id: 'M1', name: 'Zed', tier: 'standard' },
  { id: 'M2', name: 'Amy', tier: 'standard' },
  { id: 'M3', name: 'Kim', tier: 'student' },
]);

const loan = (bookId: string, memberId: string, dueOn: string, returnedOn?: string): Loan => ({
  bookId,
  memberId,
  borrowedOn: '2026-01-01',
  dueOn,
  ...(returnedOn === undefined ? {} : { returnedOn }),
});

function report(loans: readonly Loan[], asOf: string): readonly string[] {
  return overdueReportLines({ catalog, members, loans: createInMemoryLoans(loans) }, asOf);
}

describe('overdueReportLines', () => {
  it('totals each member, ranked by total then name', () => {
    const lines = report(
      [
        loan('B1', 'M1', '2026-03-08'),
        loan('B1', 'M1', '2026-03-09'),
        loan('B1', 'M2', '2026-03-07'),
        loan('B2', 'M3', '2026-03-05'),
        loan('B1', 'M3', '2026-03-10'),
      ],
      '2026-03-10',
    );
    expect(lines).toEqual([
      'Overdue fines as of 2026-03-10',
      'Kim: $2.50',
      'Amy: $0.75',
      'Zed: $0.75',
    ]);
  });

  it('keeps the final fine of a loan returned late', () => {
    expect(report([loan('B1', 'M1', '2026-03-01', '2026-03-03')], '2026-03-30')).toEqual([
      'Overdue fines as of 2026-03-30',
      'Zed: $0.50',
    ]);
  });

  it('skips loans that are not late, or whose book or member is unknown', () => {
    expect(
      report(
        [
          loan('B1', 'M1', '2026-03-10'),
          loan('B1', 'M2', '2026-03-01', '2026-03-01'),
          loan('B9', 'M1', '2026-03-01'),
          loan('B1', 'M9', '2026-03-01'),
        ],
        '2026-03-10',
      ),
    ).toEqual(['Overdue fines as of 2026-03-10', 'No overdue fines']);
  });
});

function printed(asOf: string): string {
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  overdueReportMain(asOf);
  const text = write.mock.calls.map(([chunk]) => String(chunk)).join('');
  write.mockRestore();
  return text;
}

describe('overdueReportMain', () => {
  it('prints the report for the seeded library', () => {
    expect(printed('2026-03-31')).toBe(
      [
        'Overdue fines as of 2026-03-31',
        'Barbara Liskov: $11.00',
        'Grace Hopper: $10.62',
        'Alan Turing: $5.00',
        'Brian Kernighan: $5.00',
        'Ada Lovelace: $2.05',
        'Edsger Dijkstra: $0.05',
        '',
      ].join('\n'),
    );
  });

  it('prints the report for a later date', () => {
    expect(printed('2026-04-10')).toBe(
      [
        'Overdue fines as of 2026-04-10',
        'Barbara Liskov: $16.30',
        'Grace Hopper: $11.87',
        'Alan Turing: $6.00',
        'Ada Lovelace: $5.55',
        'Brian Kernighan: $5.00',
        'Edsger Dijkstra: $1.80',
        '',
      ].join('\n'),
    );
  });

  it('prints the report for an earlier date', () => {
    expect(printed('2026-03-25')).toBe(
      [
        'Overdue fines as of 2026-03-25',
        'Grace Hopper: $7.50',
        'Barbara Liskov: $5.00',
        'Brian Kernighan: $4.75',
        'Alan Turing: $3.50',
        'Ada Lovelace: $0.25',
        '',
      ].join('\n'),
    );
  });

  it('says so when nothing is overdue', () => {
    expect(printed('2026-03-06')).toBe(
      ['Overdue fines as of 2026-03-06', 'No overdue fines', ''].join('\n'),
    );
  });
});
