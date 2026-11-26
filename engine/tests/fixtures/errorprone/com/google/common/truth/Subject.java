package com.google.common.truth;

public class Subject {
  public void isTrue() {}

  public void isEqualTo(Object other) {}

  public void isNotEqualTo(Object other) {}

  public StandardSubjectBuilder check(String format, Object... args) {
    return null;
  }

  public void isNotSameInstanceAs(Object other) {}

  public void isAnyOf(Object first, Object second, Object... rest) {}

  public void isNoneOf(Object first, Object second, Object... rest) {}

  public void isSameInstanceAs(Object other) {}
}
