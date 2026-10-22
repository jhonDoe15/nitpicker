package shop;

import java.util.List;

public final class Prices {
  public static final long FEE = 50;

  private Prices() {}

  public static long sum(List<Long> cents) {
    long total = 0;
    for (long value : cents) {
      total += value;
    }
    return total;
  }
}
