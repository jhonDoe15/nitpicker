import java.time.Duration;
import java.time.Instant;
import java.time.Period;

class F44At3 {
  void f() {
    Instant instant = Instant.now();
    instant = instant.plus(Duration.ofDays(1));
    instant = instant.plus(Period.ofDays(1));
    instant = instant.plus(Period.ofWeeks(1));
    // BUG: Diagnostic contains: fail at runtime with a UnsupportedTemporalTypeException
    instant = instant.plus(Period.ofMonths(1));
    // BUG: Diagnostic contains: fail at runtime with a UnsupportedTemporalTypeException
    instant = instant.plus(Period.ofYears(1));
    // BUG: Diagnostic contains: fail at runtime with a UnsupportedTemporalTypeException
    instant = instant.minus(Period.ofMonths(1));
    // BUG: Diagnostic contains: fail at runtime with a UnsupportedTemporalTypeException
    instant = instant.minus(Period.ofYears(1));
  }
}
