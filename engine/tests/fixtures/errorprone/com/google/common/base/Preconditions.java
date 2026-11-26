package com.google.common.base;

public final class Preconditions {
  public static <T> T checkNotNull(T reference) {
    return reference;
  }

  public static <T> T checkNotNull(T reference, Object message) {
    return reference;
  }

  public static <T> T checkNotNull(T reference, String template, Object... args) {
    return reference;
  }
}
