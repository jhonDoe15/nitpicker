package org.joda.time;

public class Period {
    public Period(Object period) {}

    public Period toPeriod() {
        return this;
    }

    public Period(long start, long end) {}

    public Period(ReadablePartial start, ReadablePartial end) {}

    public Period(ReadableInstant start, ReadableInstant end) {}

    public Period(ReadableInstant start, ReadableDuration duration) {}

    public int getMonths() {
        return 0;
    }

    public int getWeeks() {
        return 0;
    }

    public int getDays() {
        return 0;
    }

    public int getHours() {
        return 0;
    }

    public int getMinutes() {
        return 0;
    }

    public int getSeconds() {
        return 0;
    }
}
