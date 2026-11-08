package shop;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

class ClockReads {
  void readsTheClock() {
    Instant created = Instant.now(); // violation: RealClockInTest
    assertThat(LocalDate.now(ZoneOffset.UTC)).isAfter(LocalDate.of(2020, 1, 1)); // violation: RealClockInTest
    assertThat(Clock.systemUTC().millis()).isPositive(); // violation: RealClockInTest
    assertThat(created).isNotNull();
  }

  void passesAFixedClock() {
    Clock fixed = Clock.fixed(Instant.parse("2024-01-01T00:00:00Z"), ZoneOffset.UTC);
    assertThat(LocalDate.now(fixed)).isEqualTo(LocalDate.of(2024, 1, 1));
  }

  void measuresElapsedTime() {
    long start = System.currentTimeMillis();
    Instant deadline = Instant.now().plusSeconds(1);
    while (Instant.now().isBefore(deadline) && System.nanoTime() < 0) {
      Thread.onSpinWait();
    }
    assertThat(System.currentTimeMillis() - start).isLessThan(5_000);
    assertThat(Duration.between(deadline, Instant.now())).isLessThan(Duration.ofSeconds(5));
  }

  void drawsRandomValues() {
    int roll = new Random().nextInt(6); // violation: RandomInTest
    double share = Math.random(); // violation: RandomInTest
    int pick = ThreadLocalRandom.current().nextInt(3); // violation: RandomInTest
    assertThat(UUID.nameUUIDFromBytes(new byte[] {1})).isEqualTo(UUID.randomUUID()); // violation: RandomInTest
    assertThat(roll + share + pick).isNotNegative();
  }

  void usesSeededValues() {
    int roll = new Random(42).nextInt(6);
    UUID id = UUID.randomUUID();
    assertThat(roll).isBetween(0, 5);
    assertThat(UUID.fromString(id.toString())).isEqualTo(id);
  }
}
