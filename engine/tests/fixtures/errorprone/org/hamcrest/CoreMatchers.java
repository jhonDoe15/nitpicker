package org.hamcrest;

public class CoreMatchers {
  public static <T> Matcher<T> is(Matcher<T> matcher) {
    return matcher;
  }

  public static <T> Matcher<T> instanceOf(Class<?> type) {
    return null;
  }

  public static Matcher<String> containsString(String substring) {
    return null;
  }

  public static <T> Matcher<T> isA(Class<T> type) {
    return null;
  }
}
