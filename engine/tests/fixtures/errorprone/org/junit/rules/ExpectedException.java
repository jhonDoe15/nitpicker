package org.junit.rules;

import org.hamcrest.Matcher;

public class ExpectedException {
  public static ExpectedException none() {
    return new ExpectedException();
  }

  public void expect(Class<? extends Throwable> type) {}

  public void expect(Matcher<?> matcher) {}

  public void expectCause(Matcher<? extends Throwable> expectedCause) {}

  public void expectMessage(String substring) {}

  public void expectMessage(Matcher<String> matcher) {}
}
