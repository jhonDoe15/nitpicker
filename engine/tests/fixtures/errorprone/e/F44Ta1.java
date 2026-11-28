import static java.time.DayOfWeek.MONDAY;

import java.time.temporal.ChronoField;

public class F44Ta1 {
  private static final long value1 = MONDAY.getLong(ChronoField.DAY_OF_WEEK);
  // BUG: Diagnostic contains: TemporalAccessorGetChronoField
  private static final long value2 = MONDAY.getLong(ChronoField.NANO_OF_DAY);
}
