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

  public static void checkArgument(boolean expression, String errorMessageTemplate, Object... errorMessageArgs) {}

  public static void checkState(boolean expression, String errorMessageTemplate, Object... errorMessageArgs) {}

  public static void checkState(boolean expression) {}

  public static int checkElementIndex(int index, int size, String desc) {
    return index;
  }

  public static int checkPositionIndex(int index, int size, String desc) {
    return index;
  }
}
