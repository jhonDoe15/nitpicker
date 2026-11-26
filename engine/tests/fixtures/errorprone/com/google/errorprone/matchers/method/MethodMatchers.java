package com.google.errorprone.matchers.method;

import com.google.errorprone.matchers.Matcher;

public final class MethodMatchers {
  public interface MethodMatcher extends Matcher<Object> {}

  public interface InstanceMethodMatcher extends MethodMatcher {
    MethodClassMatcher onDescendantOf(String className);

    MethodClassMatcher anyClass();
  }

  public interface StaticMethodMatcher extends MethodMatcher {
    MethodClassMatcher onClass(String className);

    MethodClassMatcher anyClass();
  }

  public interface MethodClassMatcher extends MethodMatcher {
    MethodNameMatcher named(String name);
  }

  public interface MethodNameMatcher extends MethodMatcher {}

  public static StaticMethodMatcher staticMethod() {
    return null;
  }

  public static InstanceMethodMatcher instanceMethod() {
    return null;
  }
}
