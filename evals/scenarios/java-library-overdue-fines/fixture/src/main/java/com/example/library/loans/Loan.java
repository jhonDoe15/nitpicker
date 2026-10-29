package com.example.library.loans;

import com.example.library.loans.domain.Lateness;
import java.time.LocalDate;
import java.util.Optional;

/** A book borrowed by a member. */
public record Loan(
    String bookId,
    String memberId,
    LocalDate borrowedOn,
    LocalDate dueOn,
    Optional<LocalDate> returnedOn) {
  /** A loan whose book came back on the given day. */
  public Loan withReturn(LocalDate day) {
    return new Loan(bookId, memberId, borrowedOn, dueOn, Optional.of(day));
  }

  /**
   * Counts the days this loan is late as of a day. A book returned after that day is still out on
   * it.
   *
   * @param asOf the day the count is made for
   * @return the days late, never negative
   */
  public long daysLate(LocalDate asOf) {
    return Lateness.daysLate(dueOn, returnedOn, asOf);
  }

  public String describe(String title, LocalDate asOf) {
    String borrowed = title + ": borrowed " + borrowedOn;
    Optional<LocalDate> back = returnedOn.filter(day -> !day.isAfter(asOf));
    if (back.isPresent()) {
      return borrowed + ", returned " + back.get();
    }
    long late = daysLate(asOf);
    if (late == 0) {
      return borrowed + ", due " + dueOn;
    }
    return borrowed + ", due " + dueOn + ", " + late + "d late";
  }
}
