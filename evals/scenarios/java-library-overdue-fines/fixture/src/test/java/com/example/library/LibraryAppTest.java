package com.example.library;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class LibraryAppTest {
  private static final String AS_OF = "2026-03-31";

  private static String lines(String... rows) {
    return String.join("\n", rows) + "\n";
  }

  private static String ran(String... args) {
    List<String> written = new ArrayList<>();
    new LibraryApp().run(List.of(args), written::add);
    return String.join("", written);
  }

  static Stream<Arguments> memberListings() {
    return Stream.of(
        Arguments.of(
            "M1",
            lines(
                "Loans for Ada Lovelace",
                "Dune: borrowed 2026-03-10, due 2026-03-24, 7d late",
                "The Gruffalo: borrowed 2026-03-14, due 2026-03-28, 3d late",
                "B99: borrowed 2026-02-15, due 2026-03-01, 30d late")),
        Arguments.of(
            "M2",
            lines(
                "Loans for Grace Hopper",
                "World Atlas: borrowed 2026-02-24, due 2026-03-10, 21d late",
                "Dune: borrowed 2026-03-12, due 2026-03-26, 5d late")),
        Arguments.of(
            "M3",
            lines(
                "Loans for Brian Kernighan",
                "Dune: borrowed 2026-02-20, due 2026-03-06, 25d late")),
        Arguments.of(
            "M4",
            lines(
                "Loans for Alan Turing",
                "Nature Monthly: borrowed 2026-03-07, returned 2026-03-23",
                "Dune: borrowed 2026-03-01, due 2026-03-15, 16d late")),
        Arguments.of(
            "M5",
            lines(
                "Loans for Edsger Dijkstra",
                "The Gruffalo: borrowed 2026-03-16, due 2026-03-30, 1d late",
                "Dune: borrowed 2026-03-17, due 2026-03-31",
                "World Atlas: borrowed 2026-03-06, returned 2026-03-20")),
        Arguments.of(
            "M6",
            lines(
                "Loans for Barbara Liskov",
                "World Atlas: borrowed 2026-03-06, due 2026-03-20, 11d late",
                "The Gruffalo: borrowed 2026-03-24, due 2026-04-07")));
  }

  @Test
  void listsTheCatalog() {
    assertEquals(
        lines(
            "B1 Dune (novel, 25c/day)",
            "B2 World Atlas (reference, 100c/day)",
            "B3 The Gruffalo (children, 10c/day)",
            "B4 Nature Monthly (periodical, 50c/day)"),
        ran("catalog"));
  }

  @Test
  void listsEveryLoan() {
    assertEquals(
        lines(
            "M1: Dune: borrowed 2026-03-10, due 2026-03-24, 7d late",
            "M1: The Gruffalo: borrowed 2026-03-14, due 2026-03-28, 3d late",
            "M2: World Atlas: borrowed 2026-02-24, due 2026-03-10, 21d late",
            "M2: Dune: borrowed 2026-03-12, due 2026-03-26, 5d late",
            "M3: Dune: borrowed 2026-02-20, due 2026-03-06, 25d late",
            "M4: Nature Monthly: borrowed 2026-03-07, returned 2026-03-23",
            "M4: Dune: borrowed 2026-03-01, due 2026-03-15, 16d late",
            "M5: The Gruffalo: borrowed 2026-03-16, due 2026-03-30, 1d late",
            "M5: Dune: borrowed 2026-03-17, due 2026-03-31",
            "M5: World Atlas: borrowed 2026-03-06, returned 2026-03-20",
            "M6: World Atlas: borrowed 2026-03-06, due 2026-03-20, 11d late",
            "M6: The Gruffalo: borrowed 2026-03-24, due 2026-04-07",
            "M1: B99: borrowed 2026-02-15, due 2026-03-01, 30d late",
            "M99: Dune: borrowed 2026-02-16, due 2026-03-02, 29d late"),
        ran("loans", AS_OF));
  }

  @ParameterizedTest
  @MethodSource("memberListings")
  void listsLoansOfMember(String memberId, String expected) {
    assertEquals(expected, ran("member-loans", memberId, AS_OF));
  }

  @Test
  void rejectsUnknownMember() {
    assertEquals(lines("Unknown member M42"), ran("member-loans", "M42", AS_OF));
  }

  @Test
  void rejectsUnknownCommand() {
    assertEquals(lines("Unknown command shelve"), ran("shelve"));
  }
}
