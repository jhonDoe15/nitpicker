package e;

import static java.time.temporal.ChronoUnit.DAYS;
import static java.time.temporal.ChronoUnit.HOURS;
import static java.time.temporal.ChronoUnit.MONTHS;
import static java.time.temporal.ChronoUnit.SECONDS;
import static java.time.temporal.ChronoUnit.YEARS;

import java.time.Duration;
import java.time.Period;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAmount;

class S12Time {
  void periodFrom(Duration duration, Period period, TemporalAmount amount) {
    Period a = Period.from(duration);
    Period b = Period.from(period);
    Period c = Period.from(amount);
    Period d = Period.from(Duration.ofDays(1));
    Period e = Period.from(Period.ofDays(1));
    Period f = Period.from((period));
    Period g = Period.of(1, 2, 3);
  }

  @SuppressWarnings("PeriodFrom")
  void periodFromSuppressed(Duration duration) {
    Period.from(duration);
  }

  void periodGet(Period period) {
    period.get(ChronoUnit.SECONDS);
    period.get(ChronoUnit.HOURS);
    period.get(HOURS);
    period.get(SECONDS);
    period.get(ChronoUnit.FOREVER);
    period.get(ChronoUnit.YEARS);
    period.get(ChronoUnit.MONTHS);
    period.get(ChronoUnit.DAYS);
    period.get(YEARS);
    period.get(MONTHS);
    period.get(DAYS);
    period.getDays();
    ChronoUnit unit = ChronoUnit.HOURS;
    period.get(unit);
  }

  @SuppressWarnings("PeriodGetTemporalUnit")
  void periodGetSuppressed(Period period) {
    period.get(ChronoUnit.SECONDS);
  }
}
