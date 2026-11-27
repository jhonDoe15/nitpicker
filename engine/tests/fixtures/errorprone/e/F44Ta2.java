import static java.time.DayOfWeek.MONDAY;
import static java.time.temporal.ChronoField.DAY_OF_WEEK;
import static java.time.temporal.ChronoField.NANO_OF_DAY;

public class F44Ta2 {
  private static final long value1 = MONDAY.getLong(DAY_OF_WEEK);
  // BUG: Diagnostic contains: TemporalAccessorGetChronoField
  private static final long value2 = MONDAY.getLong(NANO_OF_DAY);
}
