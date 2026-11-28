package e;

import com.ibm.icu.text.DateFormatSymbols;
import com.ibm.icu.util.ULocale;
import java.text.SimpleDateFormat;
import java.time.Duration;
import java.time.LocalDate;
import java.time.Period;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Locale;
import org.joda.time.DateTime;
import org.joda.time.Instant;
import org.joda.time.LocalDateTime;

class S11Time {
  private static final LocalDate LD = LocalDate.of(1985, 5, 31);
  private static final Period PERIOD = Period.ofDays(1);
  private static final Duration DURATION = Duration.ofDays(1);
  private static final LocalDate GOOD1 = LD.plus(PERIOD);
  private static final LocalDate GOOD2 = LD.plus(1, ChronoUnit.DAYS);
  private static final LocalDate GOOD3 = LD.minus(PERIOD);
  private static final LocalDate GOOD4 = LD.minus(1, ChronoUnit.DAYS);
  private static final LocalDate BAD1 = LD.plus(DURATION);
  private static final LocalDate BAD2 = LD.minus(DURATION);
  private static final LocalDate BAD3 = LD.plus(Duration.ZERO);
  private static final LocalDate BAD4 = LD.minus(Duration.ZERO);

  @SuppressWarnings("LocalDateTemporalAmount")
  private static final LocalDate QUIET = LD.plus(DURATION);

  private static final org.joda.time.Duration DUR = org.joda.time.Duration.ZERO.toDuration();
  private static final org.joda.time.Duration DUR2 = DUR.toDuration();
  private static final org.joda.time.Duration DUR3 = new org.joda.time.Duration(DUR);
  private static final org.joda.time.Duration DUR4 = new org.joda.time.Duration(5L);

  DateTime dateTime(DateTime dt) {
    return new DateTime(dt);
  }

  DateTime dateTimeFrom(Instant i) {
    return new DateTime(i);
  }

  DateTime viaMethod(DateTime dt) {
    DateTime other = dt.toDateTime();
    return (dt).toDateTime();
  }

  Instant instant(Instant i) {
    new org.joda.time.Interval(i);
    new org.joda.time.Period("P1D");
    new LocalDateTime(new LocalDateTime("x"));
    return i.toInstant();
  }

  @SuppressWarnings("JodaToSelf")
  DateTime joda(DateTime dt) {
    return dt.toDateTime();
  }

  static final String WEEK_YEAR_PATTERN = "YYYY";
  static final String WEEK_YEAR_PATTERN_2 = "YY";
  static final String WEEK_YEAR_PATTERN_3 = "Y";

  void weekYear() {
    SimpleDateFormat sdf = new SimpleDateFormat("YYYY-MM-dd");
    sdf = new SimpleDateFormat("YY-MM-dd");
    sdf = new SimpleDateFormat("Y-MM-dd");
    sdf = new SimpleDateFormat("YYYYMMdd_HHmm");
    sdf = new SimpleDateFormat("YYYY-MM-dd", java.text.DateFormatSymbols.getInstance());
    sdf = new SimpleDateFormat("YYYY-MM-dd", Locale.getDefault());
    sdf = new SimpleDateFormat("YYYY" + "-MM-dd");
    sdf = new SimpleDateFormat(WEEK_YEAR_PATTERN);
    sdf = new SimpleDateFormat(WEEK_YEAR_PATTERN_2);
    sdf = new SimpleDateFormat(WEEK_YEAR_PATTERN_3);
    sdf = new SimpleDateFormat(WEEK_YEAR_PATTERN + "-MM-dd");
    sdf = new SimpleDateFormat(WEEK_YEAR_PATTERN_2 + "-MM-dd");
    sdf.applyPattern("YYYY-MM-dd");
    sdf.applyLocalizedPattern("YYYY-MM-dd");
    sdf.applyPattern(WEEK_YEAR_PATTERN);
    sdf.applyLocalizedPattern(WEEK_YEAR_PATTERN);
    DateTimeFormatter.ofPattern(WEEK_YEAR_PATTERN);
    DateTimeFormatter.ofPattern("YYYY-ww");
    DateTimeFormatter.ofPattern("'YYYY'");
  }

  void weekYearFine() {
    SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");
    sdf = new SimpleDateFormat("MM-dd");
    sdf = new SimpleDateFormat("yyyy-MM-dd", java.text.DateFormatSymbols.getInstance());
    sdf = new SimpleDateFormat("YYYY-ww");
    sdf = new SimpleDateFormat("YY-ww");
    sdf = new SimpleDateFormat("Y-ww");
    sdf = new SimpleDateFormat("Yw");
    sdf = new SimpleDateFormat("yyyy" + "-MM-dd");
    Mine mine = new Mine("YYYY-MM-dd");
    mine.applyPattern("YYYY-MM-dd");
    mine.applyLocalizedPattern("YYYY-MM-dd");
  }

  private static class Mine extends SimpleDateFormat {
    Mine(String pattern) {
      super(pattern);
    }
  }

  void icu() {
    com.ibm.icu.text.SimpleDateFormat sdf = new com.ibm.icu.text.SimpleDateFormat("YYYY-MM-dd");
    sdf = new com.ibm.icu.text.SimpleDateFormat("YYYY-MM-dd", DateFormatSymbols.getInstance());
    sdf = new com.ibm.icu.text.SimpleDateFormat("YYYY-MM-dd", DateFormatSymbols.getInstance(), ULocale.CANADA);
    sdf = new com.ibm.icu.text.SimpleDateFormat("YYYY-MM-dd", Locale.getDefault());
    sdf = new com.ibm.icu.text.SimpleDateFormat("YYYY-MM-dd", "", ULocale.CANADA);
    sdf = new com.ibm.icu.text.SimpleDateFormat("YYYY-MM-dd", ULocale.CANADA);
    sdf.applyPattern("YYYY-MM-dd");
    sdf.applyLocalizedPattern("YYYY-MM-dd");
  }

  @SuppressWarnings("MisusedWeekYear")
  void weekYearSuppressed() {
    new SimpleDateFormat("YYYY-MM-dd");
  }

  static final String DAY_PATTERN = "yy-MM-DD";

  void dayOfYear() {
    DateTimeFormatter.ofPattern("yy-MM-DD");
    DateTimeFormatter.ofPattern("yy-MM-dd");
    DateTimeFormatter.ofPattern("yy-DD");
    DateTimeFormatter.ofPattern("'D'yy-MM-dd");
    DateTimeFormatter.ofPattern("'D'''yy-MM-dd");
    DateTimeFormatter.ofPattern("'''D'yy-MM-dd");
    DateTimeFormatter.ofPattern("'D''D'yy-MM-dd");
    DateTimeFormatter.ofPattern("'D'yy-MM-DD");
    DateTimeFormatter.ofPattern("'D'''yy-MM-DD");
    DateTimeFormatter.ofPattern("'''D'yy-MM-DD");
    DateTimeFormatter.ofPattern("'D''D'yy-MM-DD");
    DateTimeFormatter.ofPattern("'M'yy-DD");
    DateTimeFormatter.ofPattern(DAY_PATTERN);
    DateTimeFormatter.ofPattern(DAY_PATTERN + "x");
    new SimpleDateFormat("MM-DD");
    new SimpleDateFormat().applyPattern("MM-DD");
  }

  @SuppressWarnings("MisusedDayOfYear")
  void dayOfYearSuppressed() {
    DateTimeFormatter.ofPattern("yy-MM-DD");
  }
}
