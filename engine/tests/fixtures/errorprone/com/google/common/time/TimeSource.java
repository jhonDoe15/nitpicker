package com.google.common.time;

import java.time.Instant;

public interface TimeSource {
  Instant instant();
}
