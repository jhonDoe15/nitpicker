package guards.timing;

public final class Pause {
  private static final long PAUSE_MILLIS = 5L;

  private Pause() {}

  public static void briefly() throws InterruptedException {
    Thread.sleep(PAUSE_MILLIS); // violation: forbiddenapis/thread-sleep
  }
}
