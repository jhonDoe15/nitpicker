import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogMain, memberLoansMain, overdueReportMain } from '../src/main/composition-root.js';
import { fineCents } from '../src/main/features/fines/index.js';

function capture(run: () => void): string {
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  run();
  const text = write.mock.calls.map(([chunk]) => String(chunk)).join('');
  write.mockRestore();
  return text;
}

function report(asOf: string): string {
  return capture(() => {
    overdueReportMain(asOf);
  });
}

function lines(...rows: readonly string[]): string {
  return rows.map((row) => `${row}\n`).join('');
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('fineCents', () => {
  it('charges the daily rate for each day late', () => {
    expect(fineCents({ dailyRateCents: 25, daysLate: 1, tier: 'standard' })).toBe(25);
    expect(fineCents({ dailyRateCents: 25, daysLate: 3, tier: 'standard' })).toBe(75);
    expect(fineCents({ dailyRateCents: 100, daysLate: 7, tier: 'standard' })).toBe(700);
    expect(fineCents({ dailyRateCents: 50, daysLate: 0, tier: 'standard' })).toBe(0);
  });

  it('halves the fine for students, rounding down to a whole cent', () => {
    expect(fineCents({ dailyRateCents: 25, daysLate: 1, tier: 'student' })).toBe(12);
    expect(fineCents({ dailyRateCents: 25, daysLate: 3, tier: 'student' })).toBe(37);
    expect(fineCents({ dailyRateCents: 10, daysLate: 3, tier: 'student' })).toBe(15);
    expect(fineCents({ dailyRateCents: 1, daysLate: 1, tier: 'student' })).toBe(0);
    expect(fineCents({ dailyRateCents: 100, daysLate: 0, tier: 'student' })).toBe(0);
  });

  it('caps the fine at 20 times the daily rate', () => {
    expect(fineCents({ dailyRateCents: 25, daysLate: 19, tier: 'standard' })).toBe(475);
    expect(fineCents({ dailyRateCents: 25, daysLate: 20, tier: 'standard' })).toBe(500);
    expect(fineCents({ dailyRateCents: 25, daysLate: 21, tier: 'standard' })).toBe(500);
    expect(fineCents({ dailyRateCents: 100, daysLate: 365, tier: 'standard' })).toBe(2000);
  });

  it('applies the student discount to the capped fine', () => {
    expect(fineCents({ dailyRateCents: 25, daysLate: 21, tier: 'student' })).toBe(250);
    expect(fineCents({ dailyRateCents: 25, daysLate: 20, tier: 'student' })).toBe(250);
    expect(fineCents({ dailyRateCents: 25, daysLate: 19, tier: 'student' })).toBe(237);
    expect(fineCents({ dailyRateCents: 100, daysLate: 500, tier: 'student' })).toBe(1000);
  });
});

describe('overdueReportMain', () => {
  it('lists members with fines, largest total first, ties by name', () => {
    expect(report('2026-03-31')).toBe(
      lines(
        'Overdue fines as of 2026-03-31',
        'Barbara Liskov: $11.00',
        'Grace Hopper: $10.62',
        'Alan Turing: $5.00',
        'Brian Kernighan: $5.00',
        'Ada Lovelace: $2.05',
        'Edsger Dijkstra: $0.05',
      ),
    );
  });

  it('counts days late from the day after the due date', () => {
    expect(report('2026-03-25')).toBe(
      lines(
        'Overdue fines as of 2026-03-25',
        'Grace Hopper: $7.50',
        'Barbara Liskov: $5.00',
        'Brian Kernighan: $4.75',
        'Alan Turing: $3.50',
        'Ada Lovelace: $0.25',
      ),
    );
  });

  it('keeps the final fine of loans returned late and caps long overdue loans', () => {
    expect(report('2026-04-10')).toBe(
      lines(
        'Overdue fines as of 2026-04-10',
        'Barbara Liskov: $16.30',
        'Grace Hopper: $11.87',
        'Alan Turing: $6.00',
        'Ada Lovelace: $5.55',
        'Brian Kernighan: $5.00',
        'Edsger Dijkstra: $1.80',
      ),
    );
  });

  it('says so when nothing is overdue', () => {
    expect(report('2026-03-06')).toBe(lines('Overdue fines as of 2026-03-06', 'No overdue fines'));
  });

  it('does not read the clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('1999-01-01T00:00:00Z'));
    const early = report('2026-03-31');
    vi.setSystemTime(new Date('2031-06-30T00:00:00Z'));
    const late = report('2026-03-31');
    expect(early).toBe(late);
    expect(early).toContain('Barbara Liskov: $11.00\n');
  });

  it('gives the same report each time and leaves the other commands alone', () => {
    const catalogBefore = capture(catalogMain);
    const loansBefore = capture(() => {
      memberLoansMain('M4', '2026-03-31');
    });
    const first = report('2026-03-31');
    expect(report('2026-04-10')).not.toBe(first);
    expect(report('2026-03-31')).toBe(first);
    expect(capture(catalogMain)).toBe(catalogBefore);
    expect(
      capture(() => {
        memberLoansMain('M4', '2026-03-31');
      }),
    ).toBe(loansBefore);
    expect(loansBefore).toBe(
      lines(
        'Loans for Alan Turing',
        'Nature Monthly: borrowed 2026-03-07, returned 2026-03-23',
        'Dune: borrowed 2026-03-01, due 2026-03-15, 16d late',
      ),
    );
  });
});
