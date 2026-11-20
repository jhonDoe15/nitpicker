package shop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class TimedWaitTest {
  private final ExecutorService pool = Executors.newSingleThreadExecutor();
  private final List<String> received = new CopyOnWriteArrayList<>();

  @AfterEach
  void stopPool() throws InterruptedException {
    pool.shutdownNow();
    pool.awaitTermination(1, TimeUnit.SECONDS);
    assertTrue(pool.isShutdown());
  }

  @Test
  void dropsTheResultOfALatch() throws InterruptedException {
    CountDownLatch latch = new CountDownLatch(1);
    pool.execute(() -> deliver(latch));
    latch.await(1, TimeUnit.SECONDS); // violation: IgnoredTimedWaitInTest
    assertEquals(List.of("order"), received);
  }

  @Test
  void dropsTheResultInsideATry() {
    CountDownLatch latch = new CountDownLatch(1);
    pool.execute(() -> deliver(latch));
    try {
      latch.await(1, TimeUnit.SECONDS); // violation: IgnoredTimedWaitInTest
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
    assertThat(received).containsExactly("order");
  }

  @Test
  void dropsTheResultOfOtherWaits() throws InterruptedException {
    ReentrantLock lock = new ReentrantLock();
    Semaphore permits = new Semaphore(1);
    BlockingQueue<String> queue = new ArrayBlockingQueue<>(1);
    lock.tryLock(1, TimeUnit.SECONDS); // violation: IgnoredTimedWaitInTest
    permits.tryAcquire(1, TimeUnit.SECONDS); // violation: IgnoredTimedWaitInTest
    queue.offer("order", 1, TimeUnit.SECONDS); // violation: IgnoredTimedWaitInTest
    pool.shutdown();
    pool.awaitTermination(1, TimeUnit.SECONDS); // violation: IgnoredTimedWaitInTest
    assertEquals(List.of(), received);
    lock.unlock();
  }

  @Test
  void assertsTheStateItWaitedFor() throws InterruptedException {
    CountDownLatch latch = new CountDownLatch(1);
    BlockingQueue<String> queue = new ArrayBlockingQueue<>(1);
    pool.execute(() -> deliver(latch));
    latch.await(1, TimeUnit.SECONDS);
    assertEquals(0, latch.getCount());
    queue.offer("order", 1, TimeUnit.SECONDS);
    assertThat(queue).containsExactly("order");
  }

  @Test
  void usesTheResult() throws InterruptedException {
    CountDownLatch latch = new CountDownLatch(1);
    pool.execute(() -> deliver(latch));
    assertTrue(latch.await(1, TimeUnit.SECONDS), "timed out waiting for the order");
    boolean idle = pool.awaitTermination(1, TimeUnit.MILLISECONDS);
    assertThat(idle).isFalse();
    if (!latch.await(1, TimeUnit.SECONDS)) {
      throw new IllegalStateException("timed out");
    }
    assertEquals(List.of("order"), received);
  }

  @Test
  void waitsWithoutALimitOrAnAssertion() throws InterruptedException {
    CountDownLatch latch = new CountDownLatch(1);
    pool.execute(() -> deliver(latch));
    latch.await();
    assertEquals(List.of("order"), received);
    pool.shutdown();
    pool.awaitTermination(Long.MAX_VALUE, TimeUnit.NANOSECONDS);
    assertTrue(pool.isTerminated());
    settle(latch);
  }

  @Test
  void verifiesAWaitOnAMock() throws InterruptedException {
    ExecutorService workers = mock(ExecutorService.class);
    workers.shutdown();
    verify(workers, never()).awaitTermination(1, TimeUnit.SECONDS);
    verify(workers).shutdown();
  }

  private void settle(CountDownLatch latch) throws InterruptedException {
    latch.await(1, TimeUnit.MILLISECONDS);
  }

  private void deliver(CountDownLatch latch) {
    received.add("order");
    latch.countDown();
  }
}
