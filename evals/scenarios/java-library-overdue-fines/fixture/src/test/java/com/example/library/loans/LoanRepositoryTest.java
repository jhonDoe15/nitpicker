package com.example.library.loans;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class LoanRepositoryTest {
  @Test
  void listsLoansAllOrPerMember() {
    LocalDate borrowed = LocalDate.parse("2026-03-01");
    LocalDate due = LocalDate.parse("2026-03-15");
    Loan first = new Loan("B1", "M1", borrowed, due, Optional.empty());
    Loan second = new Loan("B1", "M2", borrowed, due, Optional.empty());
    LoanRepository repository = new LoanRepository(List.of(first, second));

    assertEquals(List.of(first, second), repository.all());
    assertEquals(List.of(second), repository.forMember("M2"));
    assertEquals(List.of(), repository.forMember("M3"));
  }
}
