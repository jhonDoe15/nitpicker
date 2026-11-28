import org.joda.time.DateMidnight;
import org.joda.time.DateTime;
import org.joda.time.Duration;
import org.joda.time.Instant;
import org.joda.time.LocalDate;
import org.joda.time.Period;
import org.joda.time.convert.ConverterManager;

class S18Joda {
  private static final Duration D = Duration.ZERO;
  private static final Instant WITH = Instant.now().withMillis(42);
  private static final Instant WITH_LONG = Instant.now().withMillis(42L);
  private static final Instant INSTANT1 = new Instant(42L);
  private static final Instant WITH_VAR = INSTANT1.withMillis(44);
  private static final org.joda.time.Instant WITH_QUALIFIED = org.joda.time.Instant.now().withMillis(42L);

  @SuppressWarnings("JodaInstantWithMillis")
  private static final Instant WITH_SUPPRESSED = Instant.now().withMillis(42);

  private static final Instant PLUS = Instant.now().plus(42L);
  private static final Instant PLUS2 = Instant.now().plus(D.getMillis());
  private static final Instant MINUS = Instant.now().minus(42L);
  private static final Instant MINUS2 = Instant.now().minus(D.getMillis());
  private static final Instant PLUS_DURATION = Instant.now().plus(Duration.millis(42));
  private static final Duration D_PLUS = Duration.ZERO.plus(42L);
  private static final Duration D_MINUS = Duration.ZERO.minus(D.getMillis());
  private static final Duration D_PLUS_DURATION = Duration.ZERO.plus(D);
  private static final DateTime DT_PLUS = DateTime.now().plus(42L);
  private static final DateTime DT_MINUS = DateTime.now().minus(D.getMillis());
  private static final DateMidnight DM_PLUS = DateMidnight.now().plus(42L);
  private static final DateMidnight DM_MINUS = DateMidnight.now().minus(D.getMillis());
  private static final DateMidnight DM_PLUS_DURATION = DateMidnight.now().plus(D);

  @SuppressWarnings("JodaPlusMinusLong")
  private static final Instant PLUS_SUPPRESSED = Instant.now().plus(42L);

  private static final int DAYS = new Period(10, 20).getDays();
  private static final Period PERIOD = new Period(10, 20);
  private static final int PERIOD_DAYS = PERIOD.getDays();
  private static final int PAREN_DAYS = (new Period(10, 20)).getDays();

  int days(LocalDate a, LocalDate b) {
    return new Period(a, b).getDays();
  }

  int hours(Instant a, Instant b) {
    return new Period(a, b).getHours();
  }

  int minutes(long a, long b) {
    return new Period(a, b).getMinutes();
  }

  int mixed(Instant a, Duration d) {
    return new Period(a, d).getSeconds();
  }

  @SuppressWarnings("JodaNewPeriod")
  int suppressed(LocalDate a, LocalDate b) {
    return new Period(a, b).getMonths();
  }

  ConverterManager manager() {
    return ConverterManager.getInstance();
  }

  @SuppressWarnings("JodaTimeConverterManager")
  ConverterManager suppressedManager() {
    return ConverterManager.getInstance();
  }
}
