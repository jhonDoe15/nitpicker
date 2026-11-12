package com.example.library.loans.domain;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Optional;

/** Counts the days a loan is late. */
public final class Lateness {
  private Lateness() {}

  /**
   * Counts the days from the due date to the day the book came back, or to {@code asOf} when it is
   * still out on that day.
   *
   * @param dueOn the last day the book may be kept
   * @param returnedOn the day the book came back, if it did
   * @param asOf the day the count is made for
   * @return the days late, never negative
   */
  public static long daysLate(LocalDate dueOn, Optional<LocalDate> returnedOn, LocalDate asOf) {
    LocalDate end = returnedOn.filter(day -> day.isBefore(asOf)).orElse(asOf);
    return Math.max(0, ChronoUnit.DAYS.between(dueOn, end));
  }
}
