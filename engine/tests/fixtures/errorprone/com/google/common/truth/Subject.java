package com.google.common.truth;

public class Subject {
  public void isTrue() {}

  public void isEqualTo(Object other) {}

  public void isNotEqualTo(Object other) {}

  public StandardSubjectBuilder check(String format, Object... args) {
    return null;
  }
}
