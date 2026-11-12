package com.example.library.loans;

import java.util.List;

/** The loans of the library, in the order they were made. */
public final class LoanRepository {
  private final List<Loan> loans;

  public LoanRepository(List<Loan> loans) {
    this.loans = List.copyOf(loans);
  }

  public List<Loan> all() {
    return loans;
  }

  public List<Loan> forMember(String memberId) {
    return loans.stream().filter(loan -> loan.memberId().equals(memberId)).toList();
  }
}
