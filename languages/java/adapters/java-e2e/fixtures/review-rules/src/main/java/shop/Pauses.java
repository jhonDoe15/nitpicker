package shop;

import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;
import java.util.logging.Logger;

public final class Pauses {
  private static final Logger LOG = Logger.getLogger(Pauses.class.getName());

  private Pauses() {}

  public static int takeOrDefault(BlockingQueue<Integer> queue) {
    try {
      return queue.take();
    } catch (InterruptedException e) { // violation: SwallowedInterrupt
      return -1;
    }
  }

  public static void napQuietly(long millis) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException | IllegalStateException ignored) { // violation: SwallowedInterrupt
    }
  }

  public static void napOnItsOwnLine(long millis) {
    try {
      Thread.sleep(millis);
    }
    catch (InterruptedException // violation: SwallowedInterrupt
        e) {
    }
  }

  public static void napAndDescribe(long millis, Consumer<RuntimeException> errors) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException e) { // violation: SwallowedInterrupt
      errors.accept(new IllegalStateException("interrupted: " + e.getMessage()));
    }
  }

  public static void napAndLog(long millis) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException e) { // violation: SwallowedInterrupt
      LOG.warning(String.valueOf(new IllegalStateException(e)));
    }
  }

  public static void napAndInterruptOther(long millis, Thread worker) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException e) { // violation: SwallowedInterrupt
      worker.interrupt();
    }
  }

  public static Runnable napWithLazyRestore(long millis) {
    try {
      Thread.sleep(millis);
      return () -> {};
    } catch (InterruptedException e) { // violation: SwallowedInterrupt
      return () -> Thread.currentThread().interrupt();
    }
  }

  public static void napInLoop(long millis, int times) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException e) { // violation: SwallowedInterrupt
      for (int i = 0; i < times; i++) {
        Thread.currentThread().interrupt();
      }
    }
  }

  public static void napAfterMessageCheck(long millis) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException e) { // violation: SwallowedInterrupt
      if (e.getMessage() == null) {
        throw new IllegalStateException(e);
      }
      LOG.info("interrupted with a message");
    }
  }

  public static void napAndRecover(long millis) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException e) { // violation: SwallowedInterrupt
      try {
        throw new IllegalStateException(e);
      } catch (IllegalStateException wrapped) {
        LOG.info("recovered");
      }
    }
  }

  public static int takeAndRestore(BlockingQueue<Integer> queue) {
    try {
      return queue.take();
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return -1;
    }
  }

  public static int takeOrFail(BlockingQueue<Integer> queue) {
    try {
      return queue.take();
    } catch (InterruptedException e) {
      throw new IllegalStateException("interrupted while waiting", e);
    }
  }

  public static void napAndReport(long millis, CompletableFuture<Void> result) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException e) {
      result.completeExceptionally(e);
    }
  }

  public static void napOrRethrow(long millis) throws InterruptedException {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException e) {
      throw e;
    }
  }

  public static void napAndCollect(long millis, Consumer<RuntimeException> errors) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException e) {
      errors.accept(new IllegalStateException("interrupted", e));
      Thread.currentThread().interrupt();
    }
  }

  public static void napAndLogFirst(long millis) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException e) {
      try {
        LOG.info("interrupted");
      } finally {
        Thread.currentThread().interrupt();
      }
    }
  }

  public static int napOrChoose(long millis, boolean strict) {
    try {
      Thread.sleep(millis);
      return 1;
    } catch (InterruptedException e) {
      if (strict) {
        throw new IllegalStateException(e);
      } else {
        Thread.currentThread().interrupt();
        return -1;
      }
    }
  }

  public static final class Pacer extends Thread {
    @Override
    public void run() {
      try {
        sleep(1);
      } catch (InterruptedException e) {
        interrupt();
      }
    }
  }
}
