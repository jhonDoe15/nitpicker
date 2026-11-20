package guards;

final class HalfPairs {
  private static final String HIGH_HALF = "\uD83D";
  private static final String LOW_HALF = "x\uDE00y";

  private HalfPairs() {}

  static boolean startsPair(String text) {
    return text.startsWith(HIGH_HALF) || text.contains(LOW_HALF);
  }
}
