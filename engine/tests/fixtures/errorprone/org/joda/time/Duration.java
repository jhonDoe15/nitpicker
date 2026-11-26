package org.joda.time;

public class Duration {
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
}
