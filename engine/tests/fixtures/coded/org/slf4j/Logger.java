package org.slf4j;

public interface Logger {
    boolean isDebugEnabled();

    void info(String message, Object... arguments);

    void debug(String message, Object... arguments);

    void warn(String message, Object... arguments);

    void error(String message, Object... arguments);
}
