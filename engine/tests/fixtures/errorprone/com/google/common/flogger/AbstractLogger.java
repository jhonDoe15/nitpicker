package com.google.common.flogger;

public abstract class AbstractLogger<API extends LoggingApi<API>> {
  public final API atInfo() {
    return null;
  }

  public final API atWarning() {
    return null;
  }

  public final API atSevere() {
    return null;
  }
}
