package org.slf4j;

public interface Logger {
  void info(String message);

  void info(String format, Object... arguments);

  void warn(String format, Object... arguments);

  void error(String format, Object... arguments);
}
