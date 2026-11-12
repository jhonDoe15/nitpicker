package com.example.billing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.example.billing.adapters.BillPrinter;
import com.example.billing.adapters.Cli;
import com.example.billing.domain.BillSplitter;
import com.example.billing.domain.NoPeople;
import com.example.billing.domain.Share;
import com.example.billing.domain.Split;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class BillingRegressionTest {
  private static final List<String> TRIO = List.of("Ann", "Ben", "Cy");

  private static Split splitOf(long totalCents, List<String> people, long... cents) {
    List<Share> shares =
        IntStream.range(0, people.size())
            .mapToObj(position -> new Share(people.get(position), cents[position]))
            .toList();
    return new Split(shares, totalCents);
  }

  @ParameterizedTest
  @CsvSource({
    "1000, 334, 333, 333",
    "2000, 667, 667, 666",
    "1001, 334, 334, 333",
    "1002, 334, 334, 334",
    "2, 1, 1, 0",
    "1, 1, 0, 0",
    "0, 0, 0, 0",
    "900, 300, 300, 300"
  })
  void givesTheRemainderCentsToTheFirstPeople(long total, long ann, long ben, long cy) {
    assertEquals(splitOf(total, TRIO, ann, ben, cy), BillSplitter.splitBill(total, TRIO));
  }

  @Test
  void givesTheRemainderOfTenCentsToTheFirstTwoOfFour() {
    List<String> four = List.of("A", "B", "C", "D");

    assertEquals(splitOf(10, four, 3, 3, 2, 2), BillSplitter.splitBill(10, four));
  }

  @Test
  void keepsTheInputOrderWhenGivingOutTheRemainder() {
    List<String> people = List.of("Zed", "Amy");

    assertEquals(splitOf(3, people, 2, 1), BillSplitter.splitBill(3, people));
  }

  @Test
  void returnsNoPeopleWithTheTotalInsteadOfThrowing() {
    assertEquals(new NoPeople(1000), BillSplitter.splitBill(1000, List.of()));
    assertEquals(new NoPeople(0), BillSplitter.splitBill(0, List.of()));
  }

  @Test
  void stillChecksTheTotalBeforeLookingAtThePeople() {
    IllegalArgumentException negative =
        assertThrows(IllegalArgumentException.class, () -> BillSplitter.splitBill(-5, List.of()));
    IllegalArgumentException large =
        assertThrows(
            IllegalArgumentException.class, () -> BillSplitter.splitBill(100_000_001, List.of()));

    assertEquals("Total must not be negative", negative.getMessage());
    assertEquals("Total is too large", large.getMessage());
  }

  @Test
  void printsTheRemainderCentsOnTheFirstLines() {
    List<String> written = new ArrayList<>();

    BillPrinter.formatShares(BillSplitter.splitBill(1000, TRIO), written::add);

    assertEquals(
        List.of("Ann  $3.34\n", "Ben  $3.33\n", "Cy   $3.33\n", "Total: $10.00\n"), written);
  }

  @Test
  void printsOneLineWhenThereIsNobodyToSplitBetween() {
    List<String> written = new ArrayList<>();

    BillPrinter.formatShares(new NoPeople(1000), written::add);

    assertEquals(List.of("Nobody to split between\n"), written);
  }

  @Test
  void printsTheSplitAndTheEmptyPartyThroughTheCommandLine() {
    List<String> split = new ArrayList<>();
    List<String> empty = new ArrayList<>();

    Cli.printSplit(1000, TRIO, split::add);
    Cli.printSplit(1000, List.of(), empty::add);

    assertEquals(List.of("Ann  $3.34\n", "Ben  $3.33\n", "Cy   $3.33\n", "Total: $10.00\n"), split);
    assertEquals(List.of("Nobody to split between\n"), empty);
  }
}
