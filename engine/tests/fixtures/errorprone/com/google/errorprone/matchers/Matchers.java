package com.google.errorprone.matchers;

import com.google.errorprone.matchers.ChildMultiMatcher.MatchType;
import com.google.errorprone.matchers.method.MethodMatchers;

public final class Matchers {
  public static MethodMatchers.StaticMethodMatcher staticMethod() {
    return MethodMatchers.staticMethod();
  }

  public static MethodMatchers.InstanceMethodMatcher instanceMethod() {
    return MethodMatchers.instanceMethod();
  }

  public static <T> Matcher<T> not(Matcher<T> matcher) {
    return null;
  }

  @SafeVarargs
  public static <T> Matcher<T> allOf(Matcher<? super T>... matchers) {
    return null;
  }

  @SafeVarargs
  public static <T> Matcher<T> anyOf(Matcher<? super T>... matchers) {
    return null;
  }

  public static <T> Matcher<T> hasAnnotation(String annotation) {
    return null;
  }

  public static <T> Matcher<T> isVariable() {
    return null;
  }

  public static Matcher<Object> methodInvocation(Matcher<Object> methodSelectMatcher) {
    return null;
  }

  public static Matcher<Object> methodInvocation(Matcher<Object> methodSelectMatcher, MatchType matchType, Matcher<Object> argumentMatcher) {
    return null;
  }
}
