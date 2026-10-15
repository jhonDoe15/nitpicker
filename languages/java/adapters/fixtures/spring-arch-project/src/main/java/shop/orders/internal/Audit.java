package shop.orders.internal;

public final class Audit {
  private Audit() {}

  public static String stamp() {
    return "audit";
  }
}
