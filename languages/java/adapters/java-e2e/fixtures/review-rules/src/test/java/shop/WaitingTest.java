package shop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

import java.time.Duration;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
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
}
