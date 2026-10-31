package com.example.billing.adapters;

import com.example.billing.domain.BillSplitter;
import java.util.Arrays;
import java.util.List;

/** Command line entry point: the total in cents, then the names of the people. */
public final class Cli {
  private Cli() {}

  public static void main(String... args) {
    List<String> people = Arrays.asList(args).subList(1, args.length);
    printSplit(Long.parseLong(args[0]), people, System.out::print);
  }

  public static void printSplit(long totalCents, List<String> people, Output output) {
    BillPrinter.formatShares(BillSplitter.splitBill(totalCents, people), output);
  }
}
