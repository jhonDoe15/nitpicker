package org.joda.time;

public class DateMidnight {
    public static DateMidnight now() {
        return new DateMidnight();
    }

    public DateMidnight plus(long millis) {
        return this;
    }

    public DateMidnight minus(long millis) {
        return this;
    }

    public DateMidnight plus(ReadableDuration duration) {
        return this;
    }

    public DateMidnight minus(ReadableDuration duration) {
        return this;
    }
}
