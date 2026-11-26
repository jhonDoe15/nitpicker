package com.google.common.base;

public final class Verify {
  public static void verify(boolean expression, String errorMessageTemplate, Object... errorMessageArgs) {}

  public static <T> T verifyNotNull(T reference, String errorMessageTemplate, Object... errorMessageArgs) {
    return reference;
  }
}
