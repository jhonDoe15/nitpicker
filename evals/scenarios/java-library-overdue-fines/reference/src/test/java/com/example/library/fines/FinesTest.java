package com.example.library.fines;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.example.library.LibraryApp;
import com.example.library.catalog.Book;
import com.example.library.catalog.Catalog;
import com.example.library.catalog.Category;
import com.example.library.loans.Loan;
import com.example.library.loans.LoanRepository;
import com.example.library.members.Directory;
import com.example.library.members.Member;
import com.example.library.members.Tier;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class FinesTest {
  private static final Catalog CATALOG =
      new Catalog(
          List.of(
              new Book("B1", "Dune", Category.NOVEL), new Book("B2", "Atlas", Category.REFERENCE)));
  private static final Directory MEMBERS =
      new Directory(
          List.of(
              new Member("M1", "Zed", Tier.STANDARD),
              new Member("M2", "Amy", Tier.STANDARD),
              new Member("M3", "Kim", Tier.STUDENT)));
  private static final String MARCH_FIRST = "2026-03-01";
  private static final String MARCH_TENTH = "2026-03-10";
  private static final String OVERDUE = "overdue";
  private static final String HEADER = "Overdue fines as of " + MARCH_TENTH;

  private static LocalDate day(String isoDate) {
    return LocalDate.parse(isoDate);
  }

  private static Loan due(String bookId, String memberId, String dueOn) {
    return new Loan(bookId, memberId, day("2026-01-01"), day(dueOn), Optional.empty());
  }

  private static List<String> report(String asOf, Loan... loans) {
    FineSources sources = new FineSources(CATALOG, MEMBERS, new LoanRepository(List.of(loans)));
    return Fines.overdueReportLines(sources, day(asOf));
  }

  private static String printed(String... args) {
    List<String> written = new ArrayList<>();
    new LibraryApp().run(List.of(args), written::add);
    return String.join("", written);
  }

  private static String lines(String... rows) {
    return String.join("\n", rows) + "\n";
  }

  @ParameterizedTest
  @CsvSource({
    "25, 0, STANDARD, 0",
    "25, 1, STANDARD, 25",
    "25, 3, STANDARD, 75",
    "25, 19, STANDARD, 475",
    "25, 20, STANDARD, 500",
    "25, 21, STANDARD, 500",
    "100, 365, STANDARD, 2000",
    "25, 3, STUDENT, 37",
    "10, 2, STUDENT, 10",
    "1, 1, STUDENT, 0",
    "25, 20, STUDENT, 250",
    "25, 21, STUDENT, 250",
    "25, 90, STUDENT, 250"
  })
  void pricesLoan(long dailyRateCents, long daysLate, Tier tier, long expected) {
    assertEquals(expected, Fines.fineCents(new FineInput(dailyRateCents, daysLate, tier)));
  }

  @Test
  void totalsEachMemberRankedByTotalThenName() {
    List<String> lines =
        report(
            MARCH_TENTH,
            due("B1", "M1", "2026-03-08"),
            due("B1", "M1", "2026-03-09"),
            due("B1", "M2", "2026-03-07"),
            due("B2", "M3", "2026-03-05"),
            due("B1", "M3", MARCH_TENTH));

    assertEquals(List.of(HEADER, "Kim: $2.50", "Amy: $0.75", "Zed: $0.75"), lines);
  }

  @Test
  void keepsTheFinalFineOfLoanReturnedLate() {
    List<String> lines =
        report("2026-03-30", due("B1", "M1", MARCH_FIRST).withReturn(day("2026-03-03")));

    assertEquals(List.of("Overdue fines as of 2026-03-30", "Zed: $0.50"), lines);
  }

  @Test
  void skipsLoansThatAreNotLateOrWhoseBookOrMemberIsUnknown() {
    List<String> lines =
        report(
            MARCH_TENTH,
            due("B1", "M1", MARCH_TENTH),
            due("B1", "M2", MARCH_FIRST).withReturn(day(MARCH_FIRST)),
            due("B9", "M1", MARCH_FIRST),
            due("B1", "M9", MARCH_FIRST));

    assertEquals(List.of(HEADER, "No overdue fines"), lines);
  }

  @Test
  void writesDollarsAndTwoDigitsOfCents() {
    List<String> lines =
        report(MARCH_TENTH, due("B2", "M1", "2026-02-27"), due("B1", "M2", "2026-03-09"));

    assertEquals(List.of(HEADER, "Zed: $11.00", "Amy: $0.25"), lines);
  }

  @Test
  void printsTheReportOfTheSeededLibrary() {
    assertEquals(
        lines(
            "Overdue fines as of 2026-03-31",
            "Barbara Liskov: $11.00",
            "Grace Hopper: $10.62",
            "Alan Turing: $5.00",
            "Brian Kernighan: $5.00",
            "Ada Lovelace: $2.05",
            "Edsger Dijkstra: $0.05"),
        printed(OVERDUE, "2026-03-31"));
  }

  @Test
  void printsTheReportForLaterAndEarlierDates() {
    assertEquals(
        lines(
            "Overdue fines as of 2026-04-10",
            "Barbara Liskov: $16.30",
            "Grace Hopper: $11.87",
            "Alan Turing: $6.00",
            "Ada Lovelace: $5.55",
            "Brian Kernighan: $5.00",
            "Edsger Dijkstra: $1.80"),
        printed(OVERDUE, "2026-04-10"));
    assertEquals(
        lines(
            "Overdue fines as of 2026-03-25",
            "Grace Hopper: $7.50",
            "Barbara Liskov: $5.00",
            "Brian Kernighan: $4.75",
            "Alan Turing: $3.50",
            "Ada Lovelace: $0.25"),
        printed(OVERDUE, "2026-03-25"));
  }

  @Test
  void saysSoWhenNothingIsOverdue() {
    assertEquals(
        lines("Overdue fines as of 2026-03-06", "No overdue fines"),
        printed(OVERDUE, "2026-03-06"));
  }
}
