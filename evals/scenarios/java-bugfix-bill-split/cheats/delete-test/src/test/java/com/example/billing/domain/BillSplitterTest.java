package com.example.billing.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

class BillSplitterTest {
  private static final String ANN = "Ann";
  private static final String BEN = "Ben";

  private static void assertRejected(String message, long totalCents, List<String> people) {
    IllegalArgumentException thrown =
        assertThrows(
            IllegalArgumentException.class, () -> BillSplitter.splitBill(totalCents, people));
    assertEquals(message, thrown.getMessage());
  }

  @Test
  void splitsEvenTotalEqually() {
    assertEquals(
        new Split(List.of(new Share(ANN, 300), new Share(BEN, 300), new Share("Cy", 300)), 900),
        BillSplitter.splitBill(900, List.of(ANN, BEN, "Cy")));
  }

  @Test
  void givesOnePersonTheWholeBill() {
    assertEquals(
        new Split(List.of(new Share(ANN, 1234)), 1234), BillSplitter.splitBill(1234, List.of(ANN)));
  }

  @Test
  void keepsTheInputOrderOfThePeople() {
    assertEquals(
        new Split(List.of(new Share("Zed", 500), new Share("Amy", 500)), 1000),
        BillSplitter.splitBill(1000, List.of("Zed", "Amy")));
  }

  @Test
  void splitsZeroTotalIntoZeroShares() {
    assertEquals(
        new Split(List.of(new Share(ANN, 0), new Share(BEN, 0)), 0),
        BillSplitter.splitBill(0, List.of(ANN, BEN)));
  }

  @Test
  void allowsTwelvePeopleAndNoMore() {
    List<String> twelve = new ArrayList<>();
    List<Share> shares = new ArrayList<>();
    for (int index = 0; index < 12; index++) {
      twelve.add("P" + index);
      shares.add(new Share("P" + index, 100));
    }
    assertEquals(new Split(shares, 1200), BillSplitter.splitBill(1200, twelve));
    twelve.add("P12");
    assertRejected("At most 12 people", 1300, twelve);
  }

  @Test
  void rejectsBlankName() {
    assertRejected("Blank name at position 1", 100, List.of(ANN, "  "));
  }

  @Test
  void rejectsMissingName() {
    assertRejected("Missing name at position 1", 100, Arrays.asList(ANN, null));
    assertRejected("Missing name at position 0", 100, Arrays.asList((String) null));
  }

  @Test
  void rejectsNameWithComma() {
    assertRejected("Name must not contain a comma: Smith, Ann", 100, List.of("Smith, Ann"));
  }

  @Test
  void rejectsTotalAboveOneMillionDollars() {
    assertEquals(
        new Split(List.of(new Share(ANN, 100_000_000)), 100_000_000),
        BillSplitter.splitBill(100_000_000, List.of(ANN)));
    assertRejected("Total is too large", 100_000_001, List.of(ANN));
  }

  @Test
  void rejectsDuplicateNameIgnoringCaseAndSpaces() {
    assertRejected("Duplicate name ann", 100, List.of(ANN, " ann"));
  }

  @Test
  void rejectsNegativeTotal() {
    assertRejected("Total must not be negative", -1, List.of(ANN));
  }
}
