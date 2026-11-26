package org.junit.rules;

public class RuleChain implements TestRule {
  public static RuleChain outerRule(TestRule outer) {
    return null;
  }

  public RuleChain around(TestRule enclosed) {
    return this;
  }

  public Object apply(Object base) {
    return base;
  }
}
