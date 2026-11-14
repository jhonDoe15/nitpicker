package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;
import static com.google.errorprone.matchers.Matchers.staticMethod;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.MethodInvocationTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.fixes.SuggestedFixes;
import com.google.errorprone.matchers.Description;
import com.google.errorprone.matchers.Matcher;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.MethodInvocationTree;
import java.util.Map;

@BugPattern(
    summary = "Uses the StandardCharsets constant, not the charset looked up by its name.",
    severity = WARNING)
public final class UseStandardCharsets extends BugChecker implements MethodInvocationTreeMatcher {
  private static final Matcher<ExpressionTree> FOR_NAME =
      staticMethod().onClass("java.nio.charset.Charset").named("forName").withParameters("java.lang.String");
  private static final Map<String, String> CONSTANTS =
      Map.of(
          "US-ASCII", "US_ASCII",
          "ISO-8859-1", "ISO_8859_1",
          "UTF-8", "UTF_8",
          "UTF-16BE", "UTF_16BE",
          "UTF-16LE", "UTF_16LE",
          "UTF-16", "UTF_16");

  @Override
  public Description matchMethodInvocation(MethodInvocationTree tree, VisitorState state) {
    if (!FOR_NAME.matches(tree, state)
        || !(Support.unparenthesized(tree.getArguments().get(0))
            instanceof com.sun.source.tree.LiteralTree literal)
        || !(literal.getValue() instanceof String name)) {
      return Description.NO_MATCH;
    }
    String constant = CONSTANTS.get(name.toUpperCase(java.util.Locale.ROOT));
    if (constant == null) {
      return Description.NO_MATCH;
    }
    SuggestedFix.Builder fix = SuggestedFix.builder();
    String type = SuggestedFixes.qualifyType(state, fix, "java.nio.charset.StandardCharsets");
    return describeMatch(tree, fix.replace(tree, type + "." + constant).build());
  }
}
