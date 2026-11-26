package e;

import java.time.DateTimeException;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.Month;
import java.time.MonthDay;
import java.time.OffsetDateTime;
import java.time.OffsetTime;
import java.time.Year;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAccessor;
import java.time.temporal.TemporalField;
import java.time.temporal.TemporalUnit;

class S10FromSame {
  void from(DayOfWeek value) {
    DayOfWeek.from(value);
  }

  void from(Instant value) {
    Instant.from(value);
  }

  void from(LocalDate value) {
    LocalDate.from(value);
  }

  void from(LocalDateTime value) {
    LocalDateTime.from(value);
  }

  void from(LocalTime value) {
    LocalTime.from(value);
  }

  void from(Month value) {
    Month.from(value);
  }

  void from(MonthDay value) {
    MonthDay.from(value);
  }

  void from(OffsetDateTime value) {
    OffsetDateTime.from(value);
  }

  void from(OffsetTime value) {
    OffsetTime.from(value);
  }

  void from(Year value) {
    Year.from(value);
  }

  void from(YearMonth value) {
    YearMonth.from(value);
  }

  void from(ZonedDateTime value) {
    ZonedDateTime.from(value);
  }

  void from(ZoneOffset value) {
    ZoneOffset.from(value);
  }
}

class S10FromGood {
  void from(TemporalAccessor value) {
    DayOfWeek.from(value);
    Instant.from(value);
    LocalDate.from(value);
    LocalDateTime.from(value);
    ZoneOffset.from(value);
  }

  void from(LocalDate value) {
    Year.from(value);
    YearMonth.from(value);
    Month.from(value);
    MonthDay.from(value);
    DayOfWeek.from(value);
    LocalDate.from(value.atStartOfDay());
  }

  void from(LocalDateTime value) {
    LocalDate.from(value);
    LocalTime.from(value);
  }

  void from(ZonedDateTime value) {
    Instant.from(value);
    ZoneOffset.from(value);
  }
}

class S10FromBad {
  void from(LocalDate localDate, Instant instant, DayOfWeek day, LocalTime time, Month month) {
    LocalDateTime.from(localDate);
    LocalTime.from(localDate);
    ZonedDateTime.from(localDate);
    OffsetDateTime.from(instant);
    LocalDate.from(instant);
    LocalDate.from(day);
    Month.from(day);
    Year.from(time);
    YearMonth.from(month);
    ZoneOffset.from(localDate);
    Instant.from(localDate);
    (S10FromBad.<LocalDate>id(localDate)).toString();
    Year.from(((LocalDate) localDate));
  }

  static <T> T id(T value) {
    return value;
  }

  @SuppressWarnings("FromTemporalAccessor")
  void suppressed(LocalDate localDate) {
    LocalDateTime.from(localDate);
  }

  @SuppressWarnings("FromTemporalAccessor")
  void suppressedSame(Instant instant) {
    Instant.from(instant);
  }
}

class S10Frobber implements TemporalAccessor {
  static S10Frobber from(TemporalAccessor temporalAccessor) {
    if (temporalAccessor instanceof S10Frobber) {
      return (S10Frobber) temporalAccessor;
    }
    throw new DateTimeException("failure");
  }

  @Override
  public long getLong(TemporalField field) {
    return 0;
  }

  @Override
  public boolean isSupported(TemporalField field) {
    return false;
  }

  void use(S10Frobber value, LocalDate date) {
    S10Frobber frobber = S10Frobber.from(value);
    S10Frobber other = S10Frobber.from(date);
  }
}

class S10InstantUnit {
  private static final Instant GOOD0 = Instant.EPOCH.plus(1, ChronoUnit.DAYS);
  private static final Instant GOOD1 = Instant.EPOCH.plus(1, ChronoUnit.HALF_DAYS);
  private static final Instant GOOD2 = Instant.EPOCH.plus(1, ChronoUnit.HOURS);
  private static final Instant GOOD3 = Instant.EPOCH.minus(1, ChronoUnit.MICROS);
  private static final Instant GOOD4 = Instant.EPOCH.minus(1, ChronoUnit.NANOS);
  private static final Instant I0 = Instant.EPOCH.plus(1, ChronoUnit.CENTURIES);
  private static final Instant I1 = Instant.EPOCH.plus(1, ChronoUnit.DECADES);
  private static final Instant I2 = Instant.EPOCH.plus(1, ChronoUnit.ERAS);
  private static final Instant I3 = Instant.EPOCH.plus(1, ChronoUnit.FOREVER);
  private static final Instant I4 = Instant.EPOCH.plus(1, ChronoUnit.MILLENNIA);
  private static final Instant I5 = Instant.EPOCH.minus(1, ChronoUnit.MONTHS);
  private static final Instant I6 = Instant.EPOCH.minus(1, ChronoUnit.WEEKS);
  private static final Instant I7 = Instant.EPOCH.minus(1, ChronoUnit.YEARS);

  long until(Instant a, Instant b, TemporalUnit unit) {
    long x = a.until(b, ChronoUnit.DAYS);
    long y = a.until(b, ChronoUnit.WEEKS);
    long z = a.until(b, unit);
    return x + y + z;
  }

  Instant other(Instant a, LocalDate d) {
    Instant p = a.plus(1, ChronoUnit.valueOf("YEARS"));
    LocalDate q = d.plus(1, ChronoUnit.YEARS);
    return a.plus(java.time.Duration.ofDays(1));
  }

  @SuppressWarnings("InstantTemporalUnit")
  Instant suppressed(Instant a) {
    return a.plus(1, ChronoUnit.YEARS);
  }
}
