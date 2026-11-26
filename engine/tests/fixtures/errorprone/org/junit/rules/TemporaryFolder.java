package org.junit.rules;

public class TemporaryFolder implements TestRule {
  public Object apply(Object base) {
    return base;
  }

  public java.io.File newFile() {
    return null;
  }
}
