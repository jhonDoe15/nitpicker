import { describe, expect, it } from 'vitest';
import { createInMemoryLoans, daysLate, describeLoan } from '../src/main/features/loans/index.js';
import type { Loan } from '../src/main/features/loans/index.js';

const open: Loan = {
  bookId: 'B1',
  memberId: 'M1',
  borrowedOn: '2026-03-01',
  dueOn: '2026-03-15',
};
const returnedLate: Loan = { ...open, returnedOn: '2026-03-18' };
const returnedOnTime: Loan = { ...open, returnedOn: '2026-03-12' };

describe('daysLate', () => {
  it('is zero until the day after the due date', () => {
    expect(daysLate(open, '2026-03-10')).toBe(0);
    expect(daysLate(open, '2026-03-15')).toBe(0);
    expect(daysLate(open, '2026-03-16')).toBe(1);
  });

  it('counts across month and leap-day boundaries', () => {
    expect(daysLate({ ...open, dueOn: '2028-02-27' }, '2028-03-02')).toBe(4);
    expect(daysLate({ ...open, dueOn: '2026-02-27' }, '2026-03-02')).toBe(3);
  });

  it('stops counting at the return date', () => {
    expect(daysLate(returnedLate, '2026-04-30')).toBe(3);
    expect(daysLate(returnedLate, '2026-03-18')).toBe(3);
    expect(daysLate(returnedOnTime, '2026-04-30')).toBe(0);
  });

  it('treats a loan returned after the date as still out', () => {
    expect(daysLate(returnedLate, '2026-03-17')).toBe(2);
    expect(daysLate(returnedLate, '2026-03-10')).toBe(0);
  });
});

describe('describeLoan', () => {
  it('shows a loan that is not late', () => {
    expect(describeLoan('Dune', open, '2026-03-15')).toBe(
      'Dune: borrowed 2026-03-01, due 2026-03-15',
    );
  });

  it('shows a late loan with its days', () => {
    expect(describeLoan('Dune', open, '2026-03-20')).toBe(
      'Dune: borrowed 2026-03-01, due 2026-03-15, 5d late',
    );
  });

  it('shows a returned loan once the return date has come', () => {
    expect(describeLoan('Dune', returnedLate, '2026-03-20')).toBe(
      'Dune: borrowed 2026-03-01, returned 2026-03-18',
    );
    expect(describeLoan('Dune', returnedLate, '2026-03-18')).toBe(
      'Dune: borrowed 2026-03-01, returned 2026-03-18',
    );
  });

  it('shows a loan returned after the date as still out', () => {
    expect(describeLoan('Dune', returnedLate, '2026-03-17')).toBe(
      'Dune: borrowed 2026-03-01, due 2026-03-15, 2d late',
    );
  });
});

describe('loan repository', () => {
  it('lists loans, all or per member', () => {
    const other: Loan = { ...open, memberId: 'M2' };
    const repository = createInMemoryLoans([open, other]);
    expect(repository.all()).toEqual([open, other]);
    expect(repository.forMember('M2')).toEqual([other]);
    expect(repository.forMember('M3')).toEqual([]);
  });
});
