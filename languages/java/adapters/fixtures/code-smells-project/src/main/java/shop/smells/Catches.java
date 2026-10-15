package shop.smells;

import java.util.logging.Logger;

public final class Catches {
  private static final Logger log = Logger.getLogger("catches");

  public int quietly(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) { // violation: CatchOnlyLogsOrReturnsDefault
      log.warning("bad number " + e.getMessage());
      return -1;
    }
  }

  public int rethrown(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
      throw new IllegalArgumentException("bad number", e);
    }
  }

  public String described(String text) {
    try {
      return String.valueOf(Integer.parseInt(text));
    } catch (NumberFormatException e) {
      return e.getMessage();
    }
  }

  public int retried(String text) {
    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        return Integer.parseInt(text);
      } catch (NumberFormatException e) {
        log.warning("retrying");
      }
    }
    throw new IllegalStateException("no number");
  }

  public void paused() {
    try {
      Thread.sleep(1);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  public void counted(java.util.concurrent.atomic.AtomicInteger failures) {
    try {
      Thread.sleep(1);
    } catch (InterruptedException | RuntimeException e) { // violation: CatchOnlyLogsOrReturnsDefault
      failures.incrementAndGet();
    }
  }
}
