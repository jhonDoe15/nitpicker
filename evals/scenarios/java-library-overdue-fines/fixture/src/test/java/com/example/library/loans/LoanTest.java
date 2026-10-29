package com.example.library.loans;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class LoanTest {
  private static final String TITLE = "Dune";
  private static final Loan OPEN = open("2026-03-01", "2026-03-15");
  private static final Loan RETURNED_LATE = OPEN.withReturn(LocalDate.parse("2026-03-18"));
  private static final Loan RETURNED_ON_TIME = OPEN.withReturn(LocalDate.parse("2026-03-12"));

  private static LocalDate day(String isoDate) {
    return LocalDate.parse(isoDate);
  }

  private static Loan open(String borrowedOn, String dueOn) {
    return new Loan("B1", "M1", day(borrowedOn), day(dueOn), Optional.empty());
  }

  @Test
  void isNotLateUntilTheDayAfterTheDueDate() {
    assertEquals(0, OPEN.daysLate(day("2026-03-10")));
    assertEquals(0, OPEN.daysLate(day("2026-03-15")));
    assertEquals(1, OPEN.daysLate(day("2026-03-16")));
  }

  @Test
  void countsAcrossMonthAndLeapDayBoundaries() {
    Loan leap = open("2028-02-01", "2028-02-27");
    Loan plain = open("2026-02-01", "2026-02-27");

    assertEquals(4, leap.daysLate(day("2028-03-02")));
    assertEquals(3, plain.daysLate(day("2026-03-02")));
  }

  @Test
  void stopsCountingAtTheReturnDate() {
    assertEquals(3, RETURNED_LATE.daysLate(day("2026-04-30")));
    assertEquals(3, RETURNED_LATE.daysLate(day("2026-03-18")));
    assertEquals(0, RETURNED_ON_TIME.daysLate(day("2026-04-30")));
  }

  @Test
  void treatsLoanReturnedAfterTheDateAsStillOut() {
    assertEquals(2, RETURNED_LATE.daysLate(day("2026-03-17")));
    assertEquals(0, RETURNED_LATE.daysLate(day("2026-03-10")));
  }

  @Test
  void describesLoanThatIsNotLate() {
    assertEquals(
        "Dune: borrowed 2026-03-01, due 2026-03-15", OPEN.describe(TITLE, day("2026-03-15")));
  }

  @Test
  void describesLateLoanWithItsDays() {
    assertEquals(
        "Dune: borrowed 2026-03-01, due 2026-03-15, 5d late",
        OPEN.describe(TITLE, day("2026-03-20")));
  }

  @Test
  void describesReturnedLoanOnceTheReturnDateHasCome() {
    assertEquals(
        "Dune: borrowed 2026-03-01, returned 2026-03-18",
        RETURNED_LATE.describe(TITLE, day("2026-03-20")));
    assertEquals(
        "Dune: borrowed 2026-03-01, returned 2026-03-18",
        RETURNED_LATE.describe(TITLE, day("2026-03-18")));
  }

  @Test
  void describesLoanReturnedAfterTheDateAsStillOut() {
    assertEquals(
        "Dune: borrowed 2026-03-01, due 2026-03-15, 2d late",
        RETURNED_LATE.describe(TITLE, day("2026-03-17")));
  }

  @Test
  void keepsTheOtherFieldsWhenItIsReturned() {
    assertEquals(
        new Loan("B1", "M1", day("2026-03-01"), day("2026-03-15"), Optional.of(day("2026-03-18"))),
        RETURNED_LATE);
    assertEquals(Optional.empty(), OPEN.returnedOn());
  }
}
