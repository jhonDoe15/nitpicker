package org.joda.time;

public class Instant implements ReadableInstant {
    public long getMillis() {
        return 0;
    }

    public Instant() {}

    public Instant(Object instant) {}

    public Instant toInstant() {
        return this;
    }
}
