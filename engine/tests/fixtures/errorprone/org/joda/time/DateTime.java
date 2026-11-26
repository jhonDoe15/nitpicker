package org.joda.time;

public class DateTime {
    public DateTime() {}

    public DateTime(Object instant) {}

    public DateTime toDateTime() {
        return this;
    }

    public long getMillis() {
        return 0;
    }

    public DateTime(Chronology chronology) {}

    public DateTime(DateTimeZone zone) {}

    public static DateTime now() {
        return new DateTime();
    }

    public DateTime plus(long millis) {
        return this;
    }

    public DateTime minus(long millis) {
        return this;
    }

    public DateTime plus(ReadableDuration duration) {
        return this;
    }

    public DateTime minus(ReadableDuration duration) {
        return this;
    }
}
