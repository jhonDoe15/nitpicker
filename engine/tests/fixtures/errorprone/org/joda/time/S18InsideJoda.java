package org.joda.time;

class S18InsideJoda {
  Instant withMillis(Instant instant) {
    return instant.withMillis(42L);
  }

  Instant plus(Instant instant) {
    return instant.plus(42L).minus(42L);
  }

  Object manager() {
    return org.joda.time.convert.ConverterManager.getInstance();
  }
}
