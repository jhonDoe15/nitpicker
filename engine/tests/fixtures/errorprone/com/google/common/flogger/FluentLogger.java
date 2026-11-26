package com.google.common.flogger;

public final class FluentLogger {
    public interface Api extends LoggingApi<Api> {
    }

    public static FluentLogger forEnclosingClass() {
        return new FluentLogger();
    }

    public Api atInfo() {
        return null;
    }

    public Api atConfig() {
        return null;
    }

    public Api atFine() {
        return null;
    }

    public Api atFiner() {
        return null;
    }

    public Api atFinest() {
        return null;
    }

    public Api atWarning() {
        return null;
    }

    public Api atSevere() {
        return null;
    }
}
