import com.google.common.collect.ImmutableMap;
import java.time.Duration;

class F44At11 {
  private static final ImmutableMap<Duration, Integer> xs =
      // BUG: Diagnostic contains: Duration.ofMillis(1)
      ImmutableMap.of(Duration.ofMillis(1), 1, Duration.ofMillis(1), 2);
}
