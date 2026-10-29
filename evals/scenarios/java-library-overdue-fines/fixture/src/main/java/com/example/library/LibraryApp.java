package com.example.library;

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
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

/**
 * The composition root: it holds the library's seeded data and runs the commands {@code catalog},
 * {@code loans <asOf>} and {@code member-loans <memberId> <asOf>}, where {@code asOf} is an ISO
 * date such as 2026-03-31.
 */
public final class LibraryApp {
  private static final int RETURNED_ON_CELL = 4;

  private static final List<Book> BOOKS =
      List.of(
          new Book("B1", "Dune", Category.NOVEL),
          new Book("B2", "World Atlas", Category.REFERENCE),
          new Book("B3", "The Gruffalo", Category.CHILDREN),
          new Book("B4", "Nature Monthly", Category.PERIODICAL));

  private static final List<Member> MEMBERS =
      List.of(
          new Member("M1", "Ada Stone", Tier.STANDARD),
          new Member("M2", "Grace Mill", Tier.STUDENT),
          new Member("M3", "Brian Cole", Tier.STANDARD),
          new Member("M4", "Alan Fox", Tier.STANDARD),
          new Member("M5", "Edgar Dunn", Tier.STUDENT),
          new Member("M6", "Barbara Lane", Tier.STANDARD));

  /** One loan per row: book, member, borrowed on, due on and, when it came back, returned on. */
  private static final String LOAN_TABLE =
      """
      B1 M1 2026-03-10 2026-03-24
      B3 M1 2026-03-14 2026-03-28
      B2 M2 2026-02-24 2026-03-10
      B1 M2 2026-03-12 2026-03-26
      B1 M3 2026-02-20 2026-03-06
      B4 M4 2026-03-07 2026-03-21 2026-03-23
      B1 M4 2026-03-01 2026-03-15
      B3 M5 2026-03-16 2026-03-30
      B1 M5 2026-03-17 2026-03-31
      B2 M5 2026-03-06 2026-03-20 2026-03-20
      B2 M6 2026-03-06 2026-03-20 2026-04-05
      B3 M6 2026-03-24 2026-04-07
      B99 M1 2026-02-15 2026-03-01
      B1 M99 2026-02-16 2026-03-02
      """;

  private final Catalog catalog = new Catalog(BOOKS);
  private final Directory directory = new Directory(MEMBERS);
  private final LoanRepository repository =
      new LoanRepository(LOAN_TABLE.lines().map(LibraryApp::loanOf).toList());

  public static void main(String... args) {
    new LibraryApp().run(List.of(args), System.out::print);
  }

  private static Loan loanOf(String row) {
    String[] cells = row.split(" ");
    Loan loan =
        new Loan(
            cells[0],
            cells[1],
            LocalDate.parse(cells[2]),
            LocalDate.parse(cells[3]),
            Optional.empty());
    return Arrays.stream(cells)
        .skip(RETURNED_ON_CELL)
        .findFirst()
        .map(LocalDate::parse)
        .map(loan::withReturn)
        .orElse(loan);
  }

  /** Runs the command named by the first argument and writes its lines to the output. */
  public void run(List<String> args, Output output) {
    List<String> lines =
        switch (args.get(0)) {
          case "catalog" -> catalogLines();
          case "loans" -> loanLines(LocalDate.parse(args.get(1)));
          case "member-loans" -> memberLoanLines(args.get(1), LocalDate.parse(args.get(2)));
          default -> List.of("Unknown command " + args.get(0));
        };
    lines.forEach(line -> output.write(line + "\n"));
  }

  private String describe(Loan loan, LocalDate asOf) {
    String title = catalog.find(loan.bookId()).map(Book::title).orElse(loan.bookId());
    return loan.describe(title, asOf);
  }

  private List<String> catalogLines() {
    return catalog.all().stream().map(Book::describe).toList();
  }

  private List<String> loanLines(LocalDate asOf) {
    return repository.all().stream()
        .map(loan -> loan.memberId() + ": " + describe(loan, asOf))
        .toList();
  }

  private List<String> memberLoanLines(String memberId, LocalDate asOf) {
    return directory
        .find(memberId)
        .map(member -> loansOf(member, asOf))
        .orElse(List.of("Unknown member " + memberId));
  }

  private List<String> loansOf(Member member, LocalDate asOf) {
    List<String> lines = new ArrayList<>(List.of("Loans for " + member.name()));
    for (Loan loan : repository.forMember(member.id())) {
      lines.add(describe(loan, asOf));
    }
    return lines;
  }
}
