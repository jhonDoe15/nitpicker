package shop;

import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;

public final class Pauses {
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
}
