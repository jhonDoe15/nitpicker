package com.google.common.flogger;

public interface LoggingApi<API extends LoggingApi<API>> {
    void log();

    void log(String msg);

    void log(String message, Object p1);
}
