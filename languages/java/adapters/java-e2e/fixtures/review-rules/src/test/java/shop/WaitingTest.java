package shop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

import java.time.Duration;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.locks.LockSupport;
import org.junit.jupiter.api.Test;

class WaitingTest {
  private final AtomicBoolean done = new AtomicBoolean(true);

  @Test
  void sleeps() throws InterruptedException {
    Thread.sleep(1); // violation: FixedSleepInTest
    TimeUnit.MILLISECONDS.sleep(1); // violation: FixedSleepInTest
    await().pollDelay(Duration.ofMillis(1)).until(() -> true); // violation: FixedSleepInTest
    assertThat(done.get()).isTrue();
  }

  @Test
  void waitsForTheCondition() throws InterruptedException {
    long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(1);
    while (!done.get() && System.nanoTime() < deadline) {
      Thread.sleep(1);
    }
    await().atMost(Duration.ofSeconds(1)).until(done::get);
    Runnable task = mock(Runnable.class);
    task.run();
    verify(task, timeout(1000)).run();
    assertThat(done.get()).isTrue();
  }

  @Test
  void waitsOutADelay() {
    Runnable task = mock(Runnable.class);
    verify(task, after(1).never()).run(); // violation: NegativeWaitInTest
    await().during(Duration.ofMillis(1)).atMost(Duration.ofSeconds(1)).until(done::get); // violation: NegativeWaitInTest
    verify(task, never()).run();
  }

  @Test
  void waitsInLoopsAndWorkers() throws InterruptedException {
    for (int attempt = 0; attempt < 50 && !done.get(); attempt++) {
      Thread.sleep(1);
    }
    Runnable task = mock(Runnable.class);
    doAnswer(
            invocation -> {
              Thread.sleep(1);
              return null;
            })
        .when(task)
        .run();
    Thread worker = new Thread(task::run);
    Thread sleeper =
        new Thread(
            () -> {
              LockSupport.parkNanos(1000);
            });
    worker.start();
    sleeper.start();
    worker.join();
    sleeper.join();
    verify(task, timeout(1000)).run();
  }

  @Test
  void waitsWithoutADeadline() throws InterruptedException {
    while (true) {
      if (done.get()) {
        break;
      }
      Thread.sleep(1); // violation: FixedSleepInTest
    }
    LockSupport.parkNanos(1000); // violation: FixedSleepInTest
    Thread worker = new Thread(() -> done.set(true));
    worker.start();
    worker.join(1000); // violation: FixedSleepInTest
    Runnable task = mock(Runnable.class);
    task.run();
    verify(task, after(1).atLeastOnce()).run(); // violation: FixedSleepInTest
    assertThat(done.get()).isTrue();
  }
}
