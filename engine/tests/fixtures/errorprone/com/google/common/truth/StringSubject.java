package com.google.common.truth;

public class StringSubject extends Subject {
  public void matches(String regex) {}

  public void matches(int regex) {}

  public void doesNotMatch(String regex) {}

  public void contains(CharSequence string) {}

  public void containsMatch(String regex) {}

  public void doesNotContainMatch(String regex) {}
}
