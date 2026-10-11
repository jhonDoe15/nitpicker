import type { Loan } from '../domain/loan.js';

export type LoanRepository = {
  readonly all: () => readonly Loan[];
  readonly forMember: (memberId: string) => readonly Loan[];
};

export function createInMemoryLoans(loans: readonly Loan[]): LoanRepository {
  function all(): readonly Loan[] {
    return loans;
  }

  function forMember(memberId: string): readonly Loan[] {
    return loans.filter((loan) => loan.memberId === memberId);
  }

  return { all, forMember };
}
