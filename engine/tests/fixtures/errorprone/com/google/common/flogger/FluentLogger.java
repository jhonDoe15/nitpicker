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
}
