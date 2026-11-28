package com.google.common.flogger;

public interface LoggingApi<API extends LoggingApi<API>> {
    void log();

    void log(String msg);

    void log(String message, Object p1);

    API per(Enum<?> key);

    API atMostEvery(int n, java.util.concurrent.TimeUnit unit);

    API every(int n);

    API onAverageEvery(int n);

    API withCause(Throwable cause);

    boolean isEnabled();

    void log(String message, Object p1, Object p2);

    void log(String message, Object p1, Object p2, Object p3);
}
