package com.example.billing.adapters;

import com.example.billing.domain.NoPeople;
import com.example.billing.domain.Share;
import com.example.billing.domain.Split;
import com.example.billing.domain.SplitResult;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Prints a split as aligned text lines. */
public final class BillPrinter {
  private BillPrinter() {}

  public static void formatShares(SplitResult result, Output output) {
    for (String line : linesOf(result)) {
      output.write(line);
    }
  }

  private static List<String> linesOf(SplitResult result) {
    return switch (result) {
      case NoPeople none -> List.of("Nobody to split between\n");
      case Split split -> shareLines(split);
    };
  }

  private static List<String> shareLines(Split split) {
    int width = split.shares().stream().mapToInt(share -> share.name().length()).max().getAsInt();
    String layout = "%-" + width + "s  %s\n";
    List<String> lines = new ArrayList<>();
    for (Share share : split.shares()) {
      lines.add(String.format(Locale.ROOT, layout, share.name(), Money.format(share.cents())));
    }
    lines.add("Total: " + Money.format(split.totalCents()) + "\n");
    return lines;
  }
}
