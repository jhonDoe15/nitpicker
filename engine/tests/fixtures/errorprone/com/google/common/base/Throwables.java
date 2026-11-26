package com.google.common.base;

public final class Throwables {
  public static void throwIfUnchecked(Throwable throwable) {}

  public static void propagateIfPossible(Throwable throwable) {}

  public static RuntimeException propagate(Throwable throwable) {
    return null;
  }
}
