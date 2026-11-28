import static java.time.Duration.ofSeconds;
import static java.util.Arrays.asList;
import static org.joda.time.Duration.ZERO;
import static org.joda.time.Duration.standardMinutes;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import org.joda.time.DateTime;
import org.joda.time.Instant;

class S20Duration {
  static final int CONST = 86400;
  static final int S = 60;
  static final int M = 60;
  static final int H = 24;

  void java() {
    Duration.ofSeconds(86400);
    java.time.Duration.ofSeconds(86400);
    Duration.ofSeconds(CONST);
    Duration.ofMillis(0);
    Duration.ofMillis(4611686018427387904L);
    Duration.ofDays(1);
    Duration.ofSeconds(S);
    Duration.ofMinutes(H);
    Duration.ofHours(24);
    Duration.ofHours(48);
    Duration.ofMinutes(120);
    Duration.ofMinutes(60);
    Duration.ofMinutes(1440);
    Duration.ofMillis(1000);
    Duration.ofMillis(1500);
    Duration.ofMillis(86400000);
    Duration.ofMillis(-86400000);
    Duration.ofMillis(60 * 1000);
    Duration.ofMillis((60 * 1000));
    Duration.ofMillis(-60000);
    Duration.ofNanos(1_000_000_000L);
    Duration.ofNanos(1_000_000);
    Duration.ofNanos(86400000000000L);
    Duration.ofNanos(1_500_000);
    Duration.ofSeconds(120L);
    Duration.ofSeconds(30);
    Duration.ofSeconds(2, 1000000000);
    Duration.ofSeconds(7200 * 1L);
    Duration.ofSeconds(1.5 > 0 ? 3600 : 7200);
    Duration.parse("PT1S");
    Duration.ofSeconds('a');
    Duration.ofSeconds(120 + CONST);
    Duration.ofSeconds(120 + 3600);
  }

  void staticImport() {
    ofSeconds(86400);
    List<Duration> negative = asList(ofSeconds(120), ofSeconds(121));
    List<Duration> positive = asList(ofSeconds(120), ofSeconds(180));
    Duration d = ofSeconds(2 * 60);
    Duration e = ofSeconds(180).plus(ofSeconds(240));
    Duration f = ofSeconds(180).plus(ofSeconds(241));
    Runnable r = () -> ofSeconds(3600);
  }

  void joda() {
    org.joda.time.Duration.standardSeconds(86400);
    org.joda.time.Duration.standardSeconds(CONST);
    org.joda.time.Duration zero = org.joda.time.Duration.standardSeconds(0);
    org.joda.time.Duration.standardDays(1);
    org.joda.time.Duration.standardMinutes(0).getStandardSeconds();
    standardMinutes(0).getStandardSeconds();
    standardMinutes(120);
    org.joda.time.Duration.millis(0);
    org.joda.time.Duration.millis(1000);
    org.joda.time.Duration.standardHours(48);
    org.joda.time.Duration.standardHours(24);
    org.joda.time.Duration.standardSeconds(0).plus(org.joda.time.Duration.standardMinutes(0));
  }

  @SuppressWarnings("CanonicalDuration")
  void suppressedDuration() {
    Duration.ofSeconds(86400);
    org.joda.time.Duration.standardSeconds(0);
  }

  void withDurationAdded(Instant instant, DateTime dateTime, org.joda.time.Duration duration, long millis, int scalar) {
    instant.withDurationAdded(org.joda.time.Duration.millis(42), 1);
    instant.withDurationAdded(org.joda.time.Duration.millis(42).getMillis(), 1);
    instant.withDurationAdded(42, 2);
    instant.withDurationAdded(org.joda.time.Duration.millis(42).getMillis(), 2);
    instant.withDurationAdded(42, 1);
    instant.withDurationAdded(42, 0);
    instant.withDurationAdded(42, -1);
    instant.withDurationAdded(millis, scalar);
    instant.withDurationAdded(millis, 3);
    duration.withDurationAdded(42, 1);
    duration.withDurationAdded(duration.getMillis(), -1);
    ZERO.withDurationAdded(42, 0);
    ZERO.withDurationAdded(ZERO, 3);
    dateTime.withDurationAdded(42, 1);
    dateTime.withDurationAdded(millis, 0);
    dateTime.withDurationAdded(millis * 2, -1);
    dateTime.plus(1).withDurationAdded(5, 6);
    new DateTime().withDurationAdded(7L, 1);
    dateTime.withDurationAdded(dateTime.getMillis(), 4);
  }

  @SuppressWarnings("JodaWithDurationAddedLong")
  void suppressedAdded(Instant instant) {
    instant.withDurationAdded(42, 1);
  }

  void bigDecimal() {
    new BigDecimal("99");
    new BigDecimal("99.0");
    new BigDecimal(123_459);
    new BigDecimal(123_456L);
    BigDecimal.valueOf(123);
    new BigDecimal(-0.012);
    new BigDecimal(0.1f);
    new BigDecimal(0.99);
    new BigDecimal(0.5);
    new BigDecimal(1.0);
    new BigDecimal(100.0);
    new BigDecimal(0.0);
    new BigDecimal(-0.0);
    new BigDecimal(1e22);
    new BigDecimal(1e23);
    new BigDecimal(1e5);
    new BigDecimal(1.5e300);
    new BigDecimal(1e-10);
    new BigDecimal(2.5e-5);
    new BigDecimal(123456789.123456789);
    new BigDecimal(9223372036854775807.0);
    new BigDecimal(9.2e18);
    new BigDecimal(-9.3e18);
    new BigDecimal(+0.1);
    new BigDecimal(0.1d);
    new BigDecimal(1_000.1);
    new BigDecimal(.3);
    new BigDecimal(3.);
    new BigDecimal(3.0f);
    new BigDecimal(16777217f);
    new BigDecimal(1e-320);
    new BigDecimal(1.7976931348623157e308);
    new BigDecimal(0.1 + 0.2);
    new BigDecimal((0.1));
    new BigDecimal(-(0.1));
    new BigDecimal(1.0E-7);
    new BigDecimal(0.000001);
    new BigDecimal(0.0000001);
    new BigDecimal(0.1, java.math.MathContext.DECIMAL32);
    double variable = 0.1;
    new BigDecimal(variable);
    new BigDecimal(0.1) {};
  }

  @SuppressWarnings("BigDecimalLiteralDouble")
  void suppressedBigDecimal() {
    new BigDecimal(0.1);
  }
}
