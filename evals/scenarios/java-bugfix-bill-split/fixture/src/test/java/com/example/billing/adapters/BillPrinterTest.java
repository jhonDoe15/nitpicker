package com.example.billing.adapters;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.example.billing.domain.BillSplitter;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class BillPrinterTest {
  private static List<String> printed(long totalCents, List<String> people) {
    List<String> written = new ArrayList<>();
    BillPrinter.formatShares(BillSplitter.splitBill(totalCents, people), written::add);
    return written;
  }

  @Test
  void writesOneAlignedLinePerShareAndTotal() {
    assertEquals(
        List.of("Ann  $4.50\n", "Cy   $4.50\n", "Total: $9.00\n"),
        printed(900, List.of("Ann", "Cy")));
  }

  @Test
  void padsEveryNameToTheLongestOne() {
    assertEquals(
        List.of(
            "Bartholomew  $5.00\n",
            "Al           $5.00\n",
            "Cy           $5.00\n",
            "Total: $15.00\n"),
        printed(1500, List.of("Bartholomew", "Al", "Cy")));
  }

  @Test
  void writesCentsBelowTenWithLeadingZero() {
    assertEquals(List.of("Ann  $2.05\n", "Total: $2.05\n"), printed(205, List.of("Ann")));
  }
}
