package org.joda.time;

public class Duration implements ReadableDuration {
    public static final Duration ZERO = new Duration(0L);

    public Duration(long duration) {}

    public Duration(Object duration) {}

    public Duration toDuration() {
        return this;
    }

    public long getMillis() {
        return 0;
    }

    public long getStandardSeconds() {
        return 0;
    }

    public long getStandardMinutes() {
        return 0;
    }

    public long getStandardHours() {
        return 0;
    }

    public long getStandardDays() {
        return 0;
    }

    public Duration withMillis(long duration) {
        return this;
    }

    public static Duration millis(long millis) {
        return new Duration(millis);
    }

    public Duration(long start, long end) {}

    public Duration plus(long millis) {
        return this;
    }

    public Duration minus(long millis) {
        return this;
    }

    public Duration plus(ReadableDuration duration) {
        return this;
    }

    public Duration minus(ReadableDuration duration) {
        return this;
    }
}
