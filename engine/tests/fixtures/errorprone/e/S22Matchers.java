import static com.google.errorprone.matchers.Matchers.allOf;
import static com.google.errorprone.matchers.Matchers.anyOf;
import static com.google.errorprone.matchers.Matchers.hasAnnotation;
import static com.google.errorprone.matchers.Matchers.instanceMethod;
import static com.google.errorprone.matchers.Matchers.isVariable;
import static com.google.errorprone.matchers.Matchers.methodInvocation;
import static com.google.errorprone.matchers.Matchers.not;
import static com.google.errorprone.matchers.Matchers.staticMethod;

import com.google.errorprone.matchers.ChildMultiMatcher.MatchType;
import com.google.errorprone.matchers.Matcher;

class S22Matchers {
  static final Matcher<Object> TO_STRING = methodInvocation(instanceMethod().anyClass().named("toString"));

  static final Matcher<Object> COMBINED = methodInvocation(anyOf(instanceMethod().anyClass().named("toString"), allOf(staticMethod().anyClass().named("of"))));

  static final Matcher<Object> NEGATED = methodInvocation(not(staticMethod().onClass("java.util.List").named("of")));

  static final Matcher<Object> MIXED = methodInvocation(anyOf(instanceMethod().anyClass().named("toString"), allOf(hasAnnotation("java.lang.SuppressWarnings"))));

  static final Matcher<Object> WITH_ARGUMENTS = methodInvocation(instanceMethod().anyClass().named("toString"), MatchType.ALL, isVariable());

  static final Matcher<Object> NOT_METHOD = methodInvocation(hasAnnotation("java.lang.Deprecated"));

  static final Matcher<Object> PLAIN = instanceMethod().anyClass().named("toString");

  @SuppressWarnings("UnnecessaryMethodInvocationMatcher")
  static final Matcher<Object> SUPPRESSED = methodInvocation(staticMethod().anyClass().named("x"));
}
