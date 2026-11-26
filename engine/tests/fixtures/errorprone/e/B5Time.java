package e;

import java.time.Duration;
import java.time.Instant;

class B5Time {
  private static final int TIMEOUT_MS = 5000;
  private final long retrySeconds = 30;
  private static final long WAIT = 10L;
  private static final Integer BOXED_MILLIS = 7;
  private static final int MIXED_SECONDS = 3;
  private static final int PLAIN_UNUSED_MS = 3;
  private static final int NOT_ONLY = 9;
  private static final double FRACTION = 0.5;
  static final int PACKAGE_PRIVATE_MS = 1;
  private int notFinalMs = 4;
  private static final int EPOCH = 1000;
  private static final int TWO_ARGS = 5;
  @SuppressWarnings("StronglyTypeTime")
  private static final int QUIET_MS = 3;

  Duration timeout() {
    return Duration.ofMillis(TIMEOUT_MS);
  }

  Duration retry() {
    return Duration.ofSeconds(this.retrySeconds).plus(Duration.ofSeconds(retrySeconds));
  }

  Duration wait2() {
    return Duration.ofMinutes(WAIT);
  }

  Duration boxed() {
    return Duration.ofMillis(BOXED_MILLIS);
  }

  Duration mixed() {
    return Duration.ofMillis(MIXED_SECONDS).plus(Duration.ofSeconds(MIXED_SECONDS));
  }

  int notOnly() {
    return NOT_ONLY + Duration.ofMillis(NOT_ONLY).getNano();
  }

  Instant epoch() {
    return Instant.ofEpochMilli(EPOCH);
  }

  Duration two() {
    return Duration.ofSeconds(TWO_ARGS, 1);
  }

  Duration quiet() {
    return Duration.ofMillis(QUIET_MS);
  }

  Duration packagePrivate() {
    return Duration.ofMillis(PACKAGE_PRIVATE_MS);
  }

  Duration notFinal() {
    return Duration.ofMillis(notFinalMs);
  }

  Duration parens() {
    return Duration.ofMillis((FRACTION > 0 ? 1 : 2));
  }

  static class Inner {
    private static final long INNER_NANOS = 5;

    Duration use() {
      return Duration.ofNanos(INNER_NANOS);
    }
  }

  private static class Hidden {
    static final int HIDDEN_HOURS = 2;

    Duration use() {
      return Duration.ofHours(HIDDEN_HOURS);
    }
  }
}
