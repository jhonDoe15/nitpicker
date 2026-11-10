package shop;

import java.io.StringReader;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Phaser;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

public final class Waits {
  private Waits() {}

  static void latch(ExecutorService executor, CountDownLatch done) throws InterruptedException {
    try (StringReader in = new StringReader("a")) {
      executor.execute(() -> in.hashCode());
      done.await();
    }
  }

  static void barrier(ExecutorService executor, CyclicBarrier barrier) throws Exception {
    try (StringReader in = new StringReader("a")) {
      executor.execute(() -> in.hashCode());
      barrier.await();
    }
  }

  static void phaserArrive(ExecutorService executor, Phaser phaser) {
    try (StringReader in = new StringReader("a")) {
      executor.execute(() -> in.hashCode());
      phaser.arriveAndAwaitAdvance();
    }
  }

  static void phaserAwait(ExecutorService executor, Phaser phaser) {
    try (StringReader in = new StringReader("a")) {
      executor.execute(() -> in.hashCode());
      phaser.awaitAdvance(phaser.getPhase());
    }
  }

  static void semaphore(ExecutorService executor, Semaphore permits) throws InterruptedException {
    try (StringReader in = new StringReader("a")) {
      executor.execute(() -> in.hashCode());
      permits.acquire();
    }
  }

  static void waitBeforeStart(ExecutorService executor) throws InterruptedException {
    try (StringReader in = new StringReader("a")) {
      executor.awaitTermination(1, TimeUnit.SECONDS);
      executor.execute(() -> in.hashCode()); // violation: TaskOutlivesTryResource
    }
  }

  static void closeBeforeStart(ExecutorService executor) {
    try (StringReader in = new StringReader("a")) {
      executor.close();
      executor.execute(() -> in.hashCode()); // violation: TaskOutlivesTryResource
    }
  }

  static void waitInBranch(ExecutorService executor, boolean wait) throws InterruptedException {
    try (StringReader in = new StringReader("a")) {
      executor.execute(() -> in.hashCode()); // violation: TaskOutlivesTryResource
      if (wait) {
        executor.awaitTermination(1, TimeUnit.SECONDS);
      }
    }
  }

  static void waitInLoop(ExecutorService executor, int rounds) throws InterruptedException {
    try (StringReader in = new StringReader("a")) {
      executor.execute(() -> in.hashCode()); // violation: TaskOutlivesTryResource
      for (int round = 0; round < rounds; round++) {
        executor.awaitTermination(1, TimeUnit.SECONDS);
      }
    }
  }

  static void startAndWaitInBranch(ExecutorService executor, boolean run)
      throws InterruptedException {
    try (StringReader in = new StringReader("a")) {
      if (run) {
        executor.execute(() -> in.hashCode());
        executor.awaitTermination(1, TimeUnit.SECONDS);
      }
    }
  }

  static void waitInFinally(ExecutorService executor) throws InterruptedException {
    try (StringReader in = new StringReader("a")) {
      try {
        executor.execute(() -> in.hashCode());
      } finally {
        executor.shutdown();
        executor.awaitTermination(1, TimeUnit.SECONDS);
      }
    }
  }

  static void waitAfterBranch(ExecutorService executor, boolean run) throws InterruptedException {
    try (StringReader in = new StringReader("a")) {
      if (run) {
        executor.execute(() -> in.hashCode());
      }
      executor.awaitTermination(1, TimeUnit.SECONDS);
    }
  }
}
