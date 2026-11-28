import static java.time.DayOfWeek.MONDAY;
import static java.time.temporal.ChronoField.DAY_OF_WEEK;
import static java.time.temporal.ChronoField.NANO_OF_DAY;

public class F44Ta4 {
  private static final int value1 = MONDAY.get(DAY_OF_WEEK);
  // BUG: Diagnostic contains: TemporalAccessorGetChronoField
  private static final int value2 = MONDAY.get(NANO_OF_DAY);
}
