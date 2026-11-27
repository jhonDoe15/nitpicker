import static java.time.DayOfWeek.MONDAY;

import java.time.temporal.ChronoField;

public class F44Ta3 {
  private static final int value1 = MONDAY.get(ChronoField.DAY_OF_WEEK);
  // BUG: Diagnostic contains: TemporalAccessorGetChronoField
  private static final int value2 = MONDAY.get(ChronoField.NANO_OF_DAY);
}
