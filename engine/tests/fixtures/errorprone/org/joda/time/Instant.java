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

    public Instant(long instant) {}

    public static Instant now() {
        return new Instant();
    }

    public Instant withMillis(long millis) {
        return this;
    }

    public Instant plus(long millis) {
        return this;
    }

    public Instant minus(long millis) {
        return this;
    }

    public Instant plus(ReadableDuration duration) {
        return this;
    }

    public Instant minus(ReadableDuration duration) {
        return this;
    }
}
