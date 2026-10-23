package com.example.library;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import com.example.library.fines.FineInput;
import com.example.library.fines.Fines;
import com.example.library.members.Tier;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class FinesAcceptanceTest {
  private static String run(String... args) {
    List<String> written = new ArrayList<>();
    new LibraryApp().run(List.of(args), written::add);
    return String.join("", written);
  }

  private static String lines(String... rows) {
    return String.join("\n", rows) + "\n";
  }

  private static long fine(long dailyRateCents, long daysLate, Tier tier) {
    return Fines.fineCents(new FineInput(dailyRateCents, daysLate, tier));
  }

  @ParameterizedTest
  @CsvSource({
    "25, 1, 25",
    "25, 3, 75",
    "100, 7, 700",
    "50, 0, 0",
    "25, 19, 475",
    "25, 20, 500",
    "25, 21, 500",
    "100, 365, 2000",
    "10, 20, 200",
    "10, 25, 200"
  })
  void chargesTheDailyRateForEachDayLateUpToTwentyDays(
      long dailyRateCents, long daysLate, long expected) {
    assertEquals(expected, fine(dailyRateCents, daysLate, Tier.STANDARD));
  }

  @ParameterizedTest
  @CsvSource({
    "25, 1, 12",
    "25, 3, 37",
    "10, 3, 15",
    "1, 1, 0",
    "100, 0, 0",
    "25, 19, 237",
    "25, 20, 250",
    "25, 21, 250",
    "100, 500, 1000"
  })
  void halvesTheCappedFineForStudentsRoundingDown(
      long dailyRateCents, long daysLate, long expected) {
    assertEquals(expected, fine(dailyRateCents, daysLate, Tier.STUDENT));
  }

  @Test
  void listsMembersWithFinesLargestTotalFirstTiesByName() {
    assertEquals(
        lines(
            "Overdue fines as of 2026-03-31",
            "Barbara Liskov: $11.00",
            "Grace Hopper: $10.62",
            "Alan Turing: $5.00",
            "Brian Kernighan: $5.00",
            "Ada Lovelace: $2.05",
            "Edsger Dijkstra: $0.05"),
        run("overdue", "2026-03-31"));
  }

  @Test
  void countsDaysLateFromTheDayAfterTheDueDate() {
    assertEquals(
        lines(
            "Overdue fines as of 2026-03-25",
            "Grace Hopper: $7.50",
            "Barbara Liskov: $5.00",
            "Brian Kernighan: $4.75",
            "Alan Turing: $3.50",
            "Ada Lovelace: $0.25"),
        run("overdue", "2026-03-25"));
  }

  @Test
  void keepsTheFinalFineOfLoansReturnedLateAndCapsLongOverdueLoans() {
    assertEquals(
        lines(
            "Overdue fines as of 2026-04-10",
            "Barbara Liskov: $16.30",
            "Grace Hopper: $11.87",
            "Alan Turing: $6.00",
            "Ada Lovelace: $5.55",
            "Brian Kernighan: $5.00",
            "Edsger Dijkstra: $1.80"),
        run("overdue", "2026-04-10"));
  }

  @Test
  void capsEveryOpenLoanAndKeepsTheFineOfLoansReturnedLateHoweverFarInTheFutureTheDateIs() {
    assertEquals(
        lines(
            "Overdue fines as of 2031-01-01",
            "Barbara Liskov: $18.00",
            "Grace Hopper: $12.50",
            "Ada Lovelace: $7.00",
            "Alan Turing: $6.00",
            "Brian Kernighan: $5.00",
            "Edsger Dijkstra: $3.50"),
        run("overdue", "2031-01-01"));
  }

  @Test
  void saysSoWhenNothingIsOverdue() {
    assertEquals(
        lines("Overdue fines as of 2026-03-06", "No overdue fines"), run("overdue", "2026-03-06"));
  }

  @Test
  void givesTheSameReportEachTimeAndLeavesTheOtherCommandsAlone() {
    String catalogBefore = run("catalog");
    String loansBefore = run("member-loans", "M4", "2026-03-31");
    String first = run("overdue", "2026-03-31");

    assertNotEquals(first, run("overdue", "2026-04-10"));
    assertEquals(first, run("overdue", "2026-03-31"));
    assertEquals(catalogBefore, run("catalog"));
    assertEquals(loansBefore, run("member-loans", "M4", "2026-03-31"));
    assertEquals(
        lines(
            "Loans for Alan Turing",
            "Nature Monthly: borrowed 2026-03-07, returned 2026-03-23",
            "Dune: borrowed 2026-03-01, due 2026-03-15, 16d late"),
        loansBefore);
  }
}
