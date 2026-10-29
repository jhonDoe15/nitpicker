package com.example.billing.adapters;

import com.example.billing.domain.Share;
import com.example.billing.domain.Split;
import java.util.Locale;

/** Prints a split as aligned text lines. */
public final class BillPrinter {
  private BillPrinter() {}

  public static void formatShares(Split split, Output output) {
    int width = split.shares().stream().mapToInt(share -> share.name().length()).max().getAsInt();
    String layout = "%-" + width + "s  %s\n";
    for (Share share : split.shares()) {
      output.write(String.format(Locale.ROOT, layout, share.name(), Money.format(share.cents())));
    }
    output.write("Total: " + Money.format(split.totalCents()) + "\n");
  }
}
