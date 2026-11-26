package org.junit.rules;

public interface TestRule {
  Object apply(Object base);
}
