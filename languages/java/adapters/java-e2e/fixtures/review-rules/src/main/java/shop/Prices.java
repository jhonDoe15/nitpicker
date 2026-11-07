package shop;

import java.util.List;

public final class Prices {
  public static final long FEE = 50;
  static int discountPercent;
  private static int rounding = 1;

  private Prices() {}

  public static long sum(List<Long> cents) {
    long total = 0;
    for (long value : cents) {
      total += value;
    }
    return total;
  }

  public static long discounted(long cents) {
    long off = cents * discountPercent / 100;
    return (cents - off) / rounding * rounding;
  }

  static void setRounding(int cents) {
    rounding = cents;
  }
}
