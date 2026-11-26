package e;

import static org.joda.time.DateTimeConstants.MILLIS_PER_DAY;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.Period;
import java.util.function.Supplier;
import org.joda.time.Chronology;
import org.joda.time.DateTime;
import org.joda.time.DateTimeConstants;
import org.joda.time.DateTimeZone;

public class S17Time {
  private static final Duration WITH = Duration.ofSeconds(1);

  void duration(Duration duration, int nanos, long seconds) {
    Duration a = duration.withNanos(nanos);
    Duration b = duration.withNanos(42);
    Duration c = WITH.withNanos(1);
    Duration d = duration.withSeconds(seconds);
    Duration f = Duration.ofSeconds(3).withSeconds(5);
    Duration g = duration.plusSeconds(1);
  }

  @SuppressWarnings("JavaDurationWithNanos")
  Duration suppressedNanos(Duration duration) {
    return duration.withNanos(1);
  }

  @SuppressWarnings("JavaDurationWithSeconds")
  Duration suppressedSeconds(Duration duration) {
    return duration.withSeconds(1);
  }

  void instant(Instant instant, Instant other) {
    int a = instant.getNano();
    long b = instant.getEpochSecond();
  }

  int instantOnly(Instant instant) {
    return instant.getNano();
  }

  long instantBoth(Instant instant) {
    long seconds = instant.getEpochSecond();
    return seconds + instant.getNano();
  }

  int instantDifferent(Instant first, Instant second) {
    long seconds = first.getEpochSecond();
    return second.getNano();
  }

  int instantInLambda(Instant instant) {
    Supplier<Integer> supplier = () -> instant.getNano();
    long seconds = instant.getEpochSecond();
    return supplier.get();
  }

  int instantFieldBoth() {
    return this.field.getNano() + (int) this.field.getEpochSecond();
  }

  Instant field = Instant.EPOCH;

  int instantFieldOnly() {
    return field.getNano();
  }

  int instantCall() {
    return Instant.now().getNano();
  }

  @SuppressWarnings("JavaInstantGetSecondsGetNano")
  int instantSuppressed(Instant instant) {
    return instant.getNano();
  }

  int localDateTime(LocalDateTime time) {
    return time.getNano();
  }

  int localDateTimeBoth(LocalDateTime time) {
    return time.getSecond() + time.getNano();
  }

  int localTime(LocalTime time) {
    return time.getNano();
  }

  int localTimeBoth(LocalTime time) {
    return time.getNano() + time.getSecond();
  }

  int period(Period period) {
    return period.getDays();
  }

  int periodYears(Period period) {
    return period.getDays() + period.getYears();
  }

  int periodMonths(Period period) {
    return period.getMonths() + period.getDays();
  }

  int periodTotalMonths(Period period) {
    return (int) period.toTotalMonths() + period.getDays();
  }

  static class Holder {
    final LocalTime time = LocalTime.NOON;
    final int nano = time.getNano();
    final int second = other().getSecond();

    LocalTime other() {
      return time;
    }
  }

  void joda(Chronology chronology, DateTimeZone zone) {
    org.joda.time.Duration a = new org.joda.time.Duration(1);
    org.joda.time.Duration b = new org.joda.time.Duration(1L);
    org.joda.time.Duration c = new org.joda.time.Duration(Integer.valueOf(42));
    org.joda.time.Duration d = new org.joda.time.Duration("1");
    org.joda.time.Duration e = new org.joda.time.Duration(1L) {};
    org.joda.time.Instant f = new org.joda.time.Instant();
    org.joda.time.Instant g = new org.joda.time.Instant(1L);
    org.joda.time.Instant h = new org.joda.time.Instant("now");
    DateTime i = new DateTime();
    DateTime j = new DateTime(chronology);
    DateTime k = new DateTime(zone);
    DateTime l = new DateTime("2020-01-01");
    org.joda.time.Duration m = a.withMillis(5);
    org.joda.time.Duration n = a.withMillis(5L);
    org.joda.time.Duration o = a.toDuration();
  }

  @SuppressWarnings("JodaConstructors")
  org.joda.time.Instant jodaSuppressed() {
    return new org.joda.time.Instant();
  }

  @SuppressWarnings("JodaDurationWithMillis")
  org.joda.time.Duration jodaMillisSuppressed(org.joda.time.Duration duration) {
    return duration.withMillis(1);
  }

  long constants(DateTime when) {
    long a = DateTimeConstants.HOURS_PER_DAY;
    long b = DateTimeConstants.MILLIS_PER_SECOND + 2;
    long c = MILLIS_PER_DAY;
    long d = DateTimeConstants.DAYS_PER_WEEK;
    long e = org.joda.time.DateTimeConstants.SECONDS_PER_WEEK;
    return a + b + c + d + e;
  }

  @SuppressWarnings("JodaDateTimeConstants")
  long constantsSuppressed() {
    return DateTimeConstants.MINUTES_PER_HOUR;
  }

  static class Sub extends DateTimeConstants {
    long inherited() {
      return HOURS_PER_WEEK + Sub.MINUTES_PER_DAY;
    }
  }
}
