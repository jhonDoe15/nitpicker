package com.example.billing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.example.billing.adapters.BillPrinter;
import com.example.billing.adapters.Cli;
import com.example.billing.domain.BillSplitter;
import com.example.billing.domain.NoPeople;
import com.example.billing.domain.Share;
import com.example.billing.domain.Split;
import com.example.billing.domain.SplitResult;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class BillingAcceptanceTest {
  private static final List<String> NAMES =
      List.of("Ann", "Ben", "Cy", "Dee", "Eli", "Flo", "Gus", "Hal", "Ivy", "Jon", "Kim", "Lou");

  private static List<String> written(SplitResult result) {
    List<String> lines = new ArrayList<>();
    BillPrinter.formatShares(result, lines::add);
    return lines;
  }

  private static List<String> printed(long totalCents, List<String> people) {
    List<String> lines = new ArrayList<>();
    Cli.printSplit(totalCents, people, lines::add);
    return lines;
  }

  private static String standardOutputOf(Runnable action) {
    PrintStream original = System.out;
    ByteArrayOutputStream captured = new ByteArrayOutputStream();
    System.setOut(new PrintStream(captured, true, StandardCharsets.UTF_8));
    try {
      action.run();
    } finally {
      System.setOut(original);
    }
    return captured.toString(StandardCharsets.UTF_8);
  }

  private static Split expectedSplit(long totalCents, List<String> people) {
    long count = people.size();
    List<Share> shares = new ArrayList<>();
    for (int position = 0; position < count; position++) {
      long extra = position < totalCents % count ? 1 : 0;
      shares.add(new Share(people.get(position), totalCents / count + extra));
    }
    return new Split(shares, totalCents);
  }

  private static void assertRejected(String message, long totalCents, List<String> people) {
    IllegalArgumentException thrown =
        assertThrows(
            IllegalArgumentException.class, () -> BillSplitter.splitBill(totalCents, people));
    assertEquals(message, thrown.getMessage());
  }

  @Test
  void givesTheReportedExampleAsThreeThreeThreeFourAndATotalOf1000() {
    assertEquals(
        new Split(
            List.of(new Share("Ann", 334), new Share("Ben", 333), new Share("Cy", 333)), 1000),
        BillSplitter.splitBill(1000, List.of("Ann", "Ben", "Cy")));
  }

  @Test
  void noLongerOverAssignsWhenTheShareRoundsUp() {
    assertEquals(
        new Split(
            List.of(new Share("Ann", 667), new Share("Ben", 667), new Share("Cy", 666)), 2000),
        BillSplitter.splitBill(2000, List.of("Ann", "Ben", "Cy")));
  }

  @Test
  void givesTheExtraCentsToTheFirstPeopleInInputOrderNotToTheLast() {
    assertEquals(
        new Split(
            List.of(
                new Share("Zed", 3), new Share("Amy", 3), new Share("Bob", 2), new Share("Cal", 2)),
            10),
        BillSplitter.splitBill(10, List.of("Zed", "Amy", "Bob", "Cal")));
  }

  @ParameterizedTest
  @CsvSource({
    "0, 1",
    "0, 5",
    "1, 1",
    "1, 2",
    "1, 12",
    "2, 3",
    "5, 7",
    "6, 7",
    "7, 7",
    "8, 7",
    "100, 3",
    "101, 3",
    "102, 3",
    "999, 4",
    "1000, 12",
    "1001, 12",
    "1011, 12",
    "99999999, 11",
    "100000000, 12",
    "100000000, 7"
  })
  void splitsExactly(long totalCents, int count) {
    List<String> people = NAMES.subList(0, count);

    assertEquals(expectedSplit(totalCents, people), BillSplitter.splitBill(totalCents, people));
  }

  @Test
  void appliesTheRuleToTrimmedAndCutNamesInInputOrder() {
    assertEquals(
        new Split(
            List.of(new Share("Ann", 34), new Share("Ben", 34), new Share("C".repeat(24), 33)),
            101),
        BillSplitter.splitBill(101, List.of("  Ann ", "Ben\t", "C".repeat(30))));
  }

  @Test
  void printsTheRemainderOnTheFirstLines() {
    assertEquals(
        List.of("Ann  $3.34\n", "Ben  $3.33\n", "Cy   $3.33\n", "Total: $10.00\n"),
        written(BillSplitter.splitBill(1000, List.of("Ann", "Ben", "Cy"))));
    assertEquals(
        List.of("Ann  $6.67\n", "Ben  $6.67\n", "Cy   $6.66\n", "Total: $20.00\n"),
        written(BillSplitter.splitBill(2000, List.of("Ann", "Ben", "Cy"))));
  }

  @Test
  void writesTheRemainderThroughThePrintSplitCommand() {
    assertEquals(
        List.of("Ann  $3.34\n", "Ben  $3.33\n", "Cy   $3.33\n", "Total: $10.00\n"),
        printed(1000, List.of("Ann", "Ben", "Cy")));
  }

  @Test
  void writesTheRemainderThroughMainToStandardOutput() {
    assertEquals(
        "Ann  $3.34\nBen  $3.33\nCy   $3.33\nTotal: $10.00\n",
        standardOutputOf(() -> Cli.main("1000", "Ann", "Ben", "Cy")));
  }

  @ParameterizedTest
  @CsvSource({"0", "1", "1000", "100000000"})
  void returnsTheNoPeopleResultWithTheTotalThatWasPassedIn(long totalCents) {
    SplitResult result = BillSplitter.splitBill(totalCents, List.of());

    assertEquals(new NoPeople(totalCents), result);
    assertEquals(totalCents, result.totalCents());
  }

  @Test
  void returnsASplitForASuccessfulBillWhoseTotalIsThePassedInTotal() {
    SplitResult result = BillSplitter.splitBill(1000, List.of("Ann", "Ben"));

    assertInstanceOf(Split.class, result);
    assertEquals(1000, result.totalCents());
    assertInstanceOf(Split.class, BillSplitter.splitBill(0, List.of("Ann")));
  }

  @Test
  void printsASingleLineForTheNoPeopleResult() {
    assertEquals(
        List.of("Nobody to split between\n"), written(BillSplitter.splitBill(1000, List.of())));
  }

  @Test
  void printsTheSameSingleLineThroughPrintSplit() {
    assertEquals(List.of("Nobody to split between\n"), printed(1000, List.of()));
  }

  @Test
  void checksTheTotalBeforeLookingAtThePeople() {
    assertRejected("Total must not be negative", -1, List.of());
    assertRejected("Total is too large", 100_000_001, List.of());
    assertRejected("At most 12 people", 100, tooMany());
    assertRejected("Total is too large", 100_000_001, tooMany());
  }

  private static List<String> tooMany() {
    List<String> people = new ArrayList<>(NAMES);
    people.add("Max");
    return people;
  }

  @Test
  void keepsEveryValidationMessageAndItsOrder() {
    assertRejected("Blank name at position 1", 100, List.of("Ann", "  "));
    assertRejected("Missing name at position 1", 100, Arrays.asList("Ann", null));
    assertRejected("Missing name at position 0", 100, Arrays.asList((String) null));
    assertRejected("Name must not contain a comma: Smith, Ann", 100, List.of("Smith, Ann"));
    assertRejected("Duplicate name ann", 100, List.of("Ann", " ann"));
    assertRejected("Total is too large", 100_000_001, List.of("Ann"));
  }

  @Test
  void stillRejectsNamesThatOnlyCollideAfterCutting() {
    assertRejected(
        "Duplicate name " + "A".repeat(24), 100, List.of("A".repeat(30), "A".repeat(25)));
  }

  @Test
  void keepsTheBehaviorThatIsNotABug() {
    assertEquals(
        List.of(
            "Bartholomew  $5.00\n",
            "Al           $5.00\n",
            "Cy           $5.00\n",
            "Total: $15.00\n"),
        written(BillSplitter.splitBill(1500, List.of("Bartholomew", "Al", "Cy"))));
    assertEquals(
        List.of("Ann  $0.00\n", "Ben  $0.00\n", "Total: $0.00\n"),
        written(BillSplitter.splitBill(0, List.of("Ann", "Ben"))));
    assertEquals(
        List.of("Ann  $2.05\n", "Total: $2.05\n"),
        written(BillSplitter.splitBill(205, List.of("Ann"))));
    assertEquals(
        new Split(List.of(new Share("Ann", 300), new Share("Ben", 300), new Share("Cy", 300)), 900),
        BillSplitter.splitBill(900, List.of("Ann", "Ben", "Cy")));
  }
}
