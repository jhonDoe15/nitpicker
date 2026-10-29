package com.example.library.fines;

import com.example.library.catalog.Book;
import com.example.library.fines.domain.FineEntry;
import com.example.library.fines.domain.Report;
import com.example.library.loans.Loan;
import com.example.library.members.Member;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/** Overdue fines: what one loan costs, and the report of what every member owes. */
public final class Fines {
  private static final long CAP_DAYS = 20;

  private Fines() {}

  /**
   * Prices one late loan: the days late times the daily rate, capped at 20 days of the rate, and
   * half of that for students, rounded down.
   *
   * @param input the daily rate, the days late and the member's tier
   * @return the fine in cents
   */
  public static long fineCents(FineInput input) {
    long fullFine = Math.min(input.daysLate(), CAP_DAYS) * input.dailyRateCents();
    return switch (input.tier()) {
      case STANDARD -> fullFine;
      case STUDENT -> fullFine / 2;
    };
  }

  /**
   * Writes the report of what each member owes as of a day, one text line each.
   *
   * @param sources where the books, members and loans are read from
   * @param asOf the day the report is made for
   * @return the lines of the report, without line endings
   */
  public static List<String> overdueReportLines(FineSources sources, LocalDate asOf) {
    List<FineEntry> entries =
        sources.loans().all().stream()
            .flatMap(loan -> entryOf(sources, loan, asOf).stream())
            .toList();
    return Report.render(asOf, entries);
  }

  private static Optional<FineEntry> entryOf(FineSources sources, Loan loan, LocalDate asOf) {
    Optional<Book> book = sources.catalog().find(loan.bookId());
    Optional<Member> member = sources.members().find(loan.memberId());
    if (book.isEmpty() || member.isEmpty()) {
      return Optional.empty();
    }
    long daysLate = loan.daysLate(asOf);
    long cents =
        fineCents(new FineInput(book.get().dailyFineRateCents(), daysLate, member.get().tier()));
    return Optional.of(new FineEntry(member.get().id(), member.get().name(), cents));
  }
}
