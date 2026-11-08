package demo.util;

public final class Joiner {
  private Joiner() {}

  public static String join(String left, String right) {
    return left + "-" + right;
  }
}
