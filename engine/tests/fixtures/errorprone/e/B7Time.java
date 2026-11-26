package e;

import static java.time.Clock.systemDefaultZone;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.Year;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.chrono.IsoChronology;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

class B7Time {
  void units(TimeUnit unit, long value) {
    long a = TimeUnit.SECONDS.toMillis(1);
    long b = TimeUnit.MILLISECONDS.toSeconds(500);
    long c = TimeUnit.MILLISECONDS.toSeconds(5000);
    long d = TimeUnit.SECONDS.toSeconds(value);
    long e = TimeUnit.NANOSECONDS.toDays(100000000);
    long f = TimeUnit.SECONDS.toMinutes(1234);
    long g = TimeUnit.DAYS.toNanos(1000);
    long h = TimeUnit.MINUTES.toMinutes(7);
    long i = TimeUnit.HOURS.toSeconds(0);
    long j = unit.toSeconds(5);
    long k = TimeUnit.SECONDS.toMillis(value);
    long l = TimeUnit.SECONDS.toMillis(-1);
    long m = TimeUnit.MICROSECONDS.toNanos(0);
    long n = TimeUnit.DAYS.toDays(1000L);
    long o = TimeUnit.DAYS.toNanos(Long.MAX_VALUE);
    long p = TimeUnit.NANOSECONDS.toNanos(5);
  }

  void zones(Clock clock, Duration duration, Instant instant) {
    LocalDate a = LocalDate.now();
    LocalDateTime b = LocalDateTime.now();
    LocalTime c = LocalTime.now();
    Year d = Year.now();
    ZonedDateTime e = ZonedDateTime.now();
    Clock f = Clock.systemDefaultZone();
    Clock g = systemDefaultZone();
    LocalDate h = LocalDate.now(ZoneId.systemDefault());
    LocalDate i = LocalDate.now(clock);
    Object j = IsoChronology.INSTANCE.dateNow();
    Instant k = Instant.now();
    Supplier<LocalDate> l = LocalDate::now;
  }

  @SuppressWarnings("JavaTimeDefaultTimeZone")
  LocalDate suppressed() {
    return LocalDate.now();
  }

  long durations(Duration duration, Duration other) {
    long a = duration.getSeconds();
    long b = duration.getNano();
    long c = other.getSeconds() + other.getNano();
    long d = other.getSeconds() + duration.getNano();
    return a + b + c + d;
  }

  long onlySeconds(Duration duration) {
    return duration.getSeconds();
  }

  long onlyNano(Duration duration) {
    return duration.getNano();
  }

  long both(Duration duration) {
    return duration.getSeconds() * 1000 + duration.getNano();
  }

  Supplier<Long> lambdas(Duration duration) {
    long outside = duration.getNano();
    return () -> duration.getSeconds();
  }

  Supplier<Long> lambdas2(Duration duration) {
    return () -> {
      long a = duration.getSeconds();
      return a + duration.getNano();
    };
  }

  static final Duration FIELD = Duration.ZERO;
  static final long FIELD_SECONDS = FIELD.getSeconds();
  static final long FIELD_NANO = FIELD.getNano();
  static final long LONELY = FIELD.getNano();

  void declared(Duration[] durations) {
    long a = durations[0].getSeconds();
    long b = durations[0].getNano();
  }
}
