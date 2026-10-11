import { dayNumber } from './calendar.js';

export type Loan = {
  readonly bookId: string;
  readonly memberId: string;
  readonly borrowedOn: string;
  readonly dueOn: string;
  readonly returnedOn?: string;
};

export function daysLate(loan: Loan, asOf: string): number {
  if (loan.returnedOn === undefined) {
    return Math.max(0, dayNumber(asOf) - dayNumber(loan.dueOn));
  }
  const end = Math.min(dayNumber(asOf), dayNumber(loan.returnedOn));
  return Math.max(0, end - dayNumber(loan.dueOn));
}

export function describeLoan(title: string, loan: Loan, asOf: string): string {
  const borrowed = `${title}: borrowed ${loan.borrowedOn}`;
  if (loan.returnedOn !== undefined && loan.returnedOn <= asOf) {
    return `${borrowed}, returned ${loan.returnedOn}`;
  }
  const late = daysLate(loan, asOf);
  if (late === 0) {
    return `${borrowed}, due ${loan.dueOn}`;
  }
  return `${borrowed}, due ${loan.dueOn}, ${String(late)}d late`;
}
