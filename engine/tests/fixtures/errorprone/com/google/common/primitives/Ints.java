package com.google.common.primitives;

public final class Ints {
  private Ints() {}

  public static int checkedCast(long value) {
    return (int) value;
  }

  public static int saturatedCast(long value) {
    return (int) value;
  }

  public static int hashCode(int value) {
    return value;
  }
}
