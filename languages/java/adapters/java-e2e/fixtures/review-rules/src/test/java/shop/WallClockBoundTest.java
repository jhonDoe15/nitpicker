package shop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeout;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.opentest4j.AssertionFailedError;

abstract class WallClockBoundTest {
  private final SlowOrderService service = new SlowOrderService();

  @Test
  void limitsMeasuredTime() {
    long startedAt = System.currentTimeMillis();
    boolean cancelled = service.cancel(Status.NEW);
    long elapsed = System.currentTimeMillis() - startedAt;
    assertTrue(elapsed < 500); // violation: WallClockBoundInTest
    assertTrue(System.currentTimeMillis() - startedAt <= 200L); // violation: WallClockBoundInTest
    assertTrue(100 > elapsed); // violation: WallClockBoundInTest
    assertThat(elapsed).isLessThan(500L); // violation: WallClockBoundInTest
    assertThat(cancelled).isTrue();
  }

  @Test
  void limitsMeasuredNanoseconds() {
    long startedAt = System.nanoTime();
    boolean cancelled = service.cancel(Status.NEW);
    assertTrue(System.nanoTime() - startedAt < 50_000_000); // violation: WallClockBoundInTest
    assertThat(System.nanoTime() - startedAt).isLessThanOrEqualTo(999_999_999L); // violation: WallClockBoundInTest
    assertThat(cancelled).isTrue();
  }

  @Test
  void limitsACall() {
    assertTimeout(Duration.ofMillis(50), () -> service.cancel(Status.NEW)); // violation: WallClockBoundInTest
    assertTimeoutPreemptively(Duration.ofMillis(999), () -> service.cancel(Status.NEW)); // violation: WallClockBoundInTest
    assertThat(service.cancel(Status.NEW)).isTrue();
  }

  @Test
  @Timeout(value = 200, unit = TimeUnit.MILLISECONDS) // violation: WallClockBoundInTest
  void limitsTheTest() {
    assertThat(service.cancel(Status.NEW)).isTrue();
  }

  @Test
  @Timeout(5)
  void guardsAgainstAHang() {
    long startedAt = System.currentTimeMillis();
    boolean cancelled = service.cancel(Status.NEW);
    long elapsed = System.currentTimeMillis() - startedAt;
    assertTrue(elapsed < 5000);
    assertTrue(System.nanoTime() - TimeUnit.MILLISECONDS.toNanos(startedAt) < 1_000_000L);
    assertThat(elapsed).isLessThan(1000L);
    assertTimeout(Duration.ofSeconds(1), () -> service.cancel(Status.NEW));
    assertTimeout(Duration.ofMillis(1000), () -> service.cancel(Status.NEW));
    assertThat(cancelled).isTrue();
  }

  @Test
  @Timeout(value = 2000, unit = TimeUnit.MILLISECONDS)
  void comparesOtherNumbers() {
    long total = 700;
    long discount = total - 300;
    assertTrue(discount < 500);
    assertThat(total - discount).isLessThan(500L);
    long waited = System.currentTimeMillis() - total;
    assertTrue(waited > 100);
    long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
    assertTrue(System.nanoTime() - deadline < 0);
    long stamp = System.currentTimeMillis();
    assertTrue(total - System.currentTimeMillis() < 100);
    assertTrue(stamp - System.currentTimeMillis() < 100);
  }

  @Test
  void expectsTheLimitToBeHit() {
    assertThrows(
        AssertionFailedError.class,
        () -> assertTimeoutPreemptively(Duration.ofMillis(20), () -> service.cancel(Status.NEW)));
    assertThat(service.cancel(Status.NEW)).isTrue();
  }
}
