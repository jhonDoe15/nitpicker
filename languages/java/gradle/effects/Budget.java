package nitpicker.effects;

public final class Budget {
  public static final int MAX_INSTRUCTIONS = 30_000;
  public static final int MAX_BACK_EDGES = 64;
  private static final long DEFAULT_SECONDS = 240;
  private static long start = System.nanoTime();
  private static long limit = DEFAULT_SECONDS * 1_000_000_000L;
  private static int oversized;

  private Budget() {}

  public static void begin(long seconds) {
    start = System.nanoTime();
    limit = (seconds > 0 ? seconds : DEFAULT_SECONDS) * 1_000_000_000L;
    oversized = 0;
  }

  public static boolean expired() {
    return System.nanoTime() - start > limit;
  }

  public static void oversized() {
    oversized++;
  }

  public static int oversizedMethods() {
    return oversized;
  }
}
