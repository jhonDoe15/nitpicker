package org.joda.time;

class S11InsideJoda {
  private static final Duration DURATION = Duration.ZERO.toDuration();

  DateTime copy(DateTime dt) {
    return new DateTime(dt);
  }
}
