package e;

import static java.time.temporal.ChronoUnit.DAYS;
import static java.time.temporal.ChronoUnit.HOURS;
import static java.time.temporal.ChronoUnit.MONTHS;
import static java.time.temporal.ChronoUnit.SECONDS;
import static java.util.concurrent.TimeUnit.MILLISECONDS;

import com.google.common.time.Durations;
import com.google.common.time.Instants;
import java.time.Duration;
import java.time.Instant;
import java.time.Period;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAmount;
import java.time.temporal.TemporalUnit;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

class S9DurationFrom {
  void run(Duration d, Period p, TemporalAmount amount) {
    Duration a = Duration.from(d);
    Duration b = Duration.from(p);
    Duration c = Duration.from(amount);
    Duration e = Duration.from(Duration.ofSeconds(1));
    Duration f = Duration.from(Period.ofDays(1));
    Duration g = java.time.Duration.from((d));
    Duration h = Duration.from(d.plusDays(1));
  }

  @SuppressWarnings("DurationFrom")
  Duration suppressed(Duration d) {
    return Duration.from(d);
  }
}

class S9DurationGet {
  void run(Duration d, TemporalUnit unit) {
    long a = d.get(ChronoUnit.DAYS);
    long b = d.get(ChronoUnit.HOURS);
    long c = d.get(ChronoUnit.MINUTES);
    long e = d.get(ChronoUnit.SECONDS);
    long f = d.get(ChronoUnit.MILLIS);
    long g = d.get(ChronoUnit.NANOS);
    long h = d.get(ChronoUnit.MICROS);
    long i = d.get(ChronoUnit.MONTHS);
    long j = d.get(DAYS);
    long k = d.get(SECONDS);
    long l = d.get(unit);
    long m = d.plusDays(1).get(ChronoUnit.HOURS);
    long n = d.get(HOURS);
    long o = d.get(MONTHS);
    long p = d.get(java.time.temporal.ChronoUnit.DAYS);
    long q = (d).get(ChronoUnit.DAYS);
  }

  @SuppressWarnings("DurationGetTemporalUnit")
  long suppressed(Duration d) {
    return d.get(ChronoUnit.DAYS);
  }
}

class S9DurationUnit {
  void run(Duration d, long n) {
    Duration a = Duration.of(n, ChronoUnit.DAYS);
    Duration b = Duration.of(n, ChronoUnit.WEEKS);
    Duration c = Duration.of(n, ChronoUnit.MONTHS);
    Duration e = Duration.of(n, ChronoUnit.YEARS);
    Duration f = Duration.of(n, ChronoUnit.DECADES);
    Duration g = Duration.of(n, ChronoUnit.CENTURIES);
    Duration h = Duration.of(n, ChronoUnit.MILLENNIA);
    Duration i = Duration.of(n, ChronoUnit.ERAS);
    Duration j = Duration.of(n, ChronoUnit.FOREVER);
    Duration k = Duration.of(n, ChronoUnit.HOURS);
    Duration l = Duration.of(n, MONTHS);
    Duration m = d.plus(n, ChronoUnit.YEARS);
    Duration o = d.minus(n, ChronoUnit.YEARS);
    Duration p = d.plus(n, ChronoUnit.DAYS);
    Duration q = d.minus(n, ChronoUnit.WEEKS);
    Duration r = d.plus(Duration.ofDays(1));
    Duration s = Duration.of(n, java.time.temporal.ChronoUnit.MONTHS);
  }

  @SuppressWarnings("DurationTemporalUnit")
  Duration suppressed(long n) {
    return Duration.of(n, ChronoUnit.MONTHS);
  }
}

class S9DurationLong {
  void run(Duration d, Instant instant, Future<String> future, org.joda.time.Duration joda, org.joda.time.DateTime time, org.joda.time.Instant instant2, org.joda.time.base.BaseDuration base, com.google.protobuf.Duration proto, com.google.protobuf.Timestamp stamp) throws Exception {
    future.get(d.toMillis(), TimeUnit.SECONDS);
    future.get(d.toMillis(), TimeUnit.MILLISECONDS);
    future.get(d.toMillis(), MILLISECONDS);
    future.get(d.toNanos(), TimeUnit.MILLISECONDS);
    future.get(d.getSeconds(), TimeUnit.MINUTES);
    future.get(d.toMinutes(), TimeUnit.SECONDS);
    future.get(d.toHours(), TimeUnit.SECONDS);
    future.get(d.toDays(), TimeUnit.SECONDS);
    future.get(d.toSeconds(), TimeUnit.MILLISECONDS);
    future.get(instant.toEpochMilli(), TimeUnit.SECONDS);
    future.get(instant.getEpochSecond(), TimeUnit.MILLISECONDS);
    future.get(Durations.toNanosSaturated(d), TimeUnit.SECONDS);
    future.get(Durations.toMicros(d), TimeUnit.SECONDS);
    future.get(Durations.toMicrosSaturated(d), TimeUnit.SECONDS);
    future.get(Durations.toMillisSaturated(d), TimeUnit.SECONDS);
    future.get(Instants.toEpochNanos(instant), TimeUnit.SECONDS);
    future.get(Instants.toEpochMicros(instant), TimeUnit.SECONDS);
    future.get(Instants.toEpochMillisSaturated(instant), TimeUnit.SECONDS);
    future.get(joda.getStandardSeconds(), TimeUnit.MILLISECONDS);
    future.get(joda.getStandardMinutes(), TimeUnit.MILLISECONDS);
    future.get(joda.getStandardHours(), TimeUnit.MILLISECONDS);
    future.get(joda.getStandardDays(), TimeUnit.MILLISECONDS);
    future.get(joda.getMillis(), TimeUnit.SECONDS);
    future.get(time.getMillis(), TimeUnit.SECONDS);
    future.get(instant2.getMillis(), TimeUnit.SECONDS);
    future.get(base.getMillis(), TimeUnit.SECONDS);
    future.get(proto.getSeconds(), TimeUnit.MILLISECONDS);
    future.get(stamp.getSeconds(), TimeUnit.MILLISECONDS);
    future.get(TimeUnit.MINUTES.convert(d), TimeUnit.SECONDS);
    future.get(TimeUnit.MINUTES.convert(d), TimeUnit.MINUTES);
    future.get(TimeUnit.SECONDS.convert(d), MILLISECONDS);
    future.get(5, TimeUnit.SECONDS);
    future.get(d.toMillis(), pick());
    future.get(d.toMillis() + 1, TimeUnit.SECONDS);
    future.get((d.toMillis()), TimeUnit.SECONDS);
    future.get((int) d.toMillis(), TimeUnit.SECONDS);
    both(d.toMillis(), TimeUnit.SECONDS, d.toSeconds(), TimeUnit.MINUTES);
    both(1, TimeUnit.SECONDS, d.toSeconds(), TimeUnit.MINUTES);
    pair(d.toMillis(), d.toMillis(), TimeUnit.SECONDS);
  }

  TimeUnit pick() {
    return TimeUnit.SECONDS;
  }

  void both(long a, TimeUnit u, long b, TimeUnit v) {}

  void pair(long a, long b, TimeUnit u) {}

  @SuppressWarnings("DurationToLongTimeUnit")
  void suppressed(Future<String> future, Duration d) throws Exception {
    future.get(d.toMillis(), TimeUnit.SECONDS);
  }
}
