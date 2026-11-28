package org.joda.time;

import static org.joda.time.Duration.ZERO;

class S20InsideJoda {
  private static final Instant A = Instant.now().withDurationAdded(42, 1);
  private static final Duration B = ZERO.withDurationAdded(42, 1);
  private static final DateTime C = DateTime.now().withDurationAdded(42, 1);
}
