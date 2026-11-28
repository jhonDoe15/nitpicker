import static java.time.temporal.ChronoField.DAY_OF_WEEK;
import static java.time.temporal.ChronoField.MICRO_OF_SECOND;

import java.time.Instant;

public class F44Ta5 {
  private static final int value1 = Instant.now().get(MICRO_OF_SECOND);
  private static final long value2 = Instant.now().getLong(MICRO_OF_SECOND);
  // BUG: Diagnostic contains: TemporalAccessorGetChronoField
  private static final int value3 = Instant.now().get(DAY_OF_WEEK);
  // BUG: Diagnostic contains: TemporalAccessorGetChronoField
  private static final long value4 = Instant.now().getLong(DAY_OF_WEEK);
}
