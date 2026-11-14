package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.AnnotationTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.fixes.SuggestedFixes;
import com.google.errorprone.matchers.Description;
import com.sun.source.tree.AnnotationTree;
import com.sun.source.tree.AssignmentTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.util.TreePath;
import java.util.ArrayList;
import java.util.List;

@BugPattern(
    summary = "Removes the retry of a test: a test that passes on a later attempt hides a flaky or racy test.",
    severity = WARNING)
public final class RetryInTest extends BugChecker implements AnnotationTreeMatcher {
  private static final String[] RETRY = {
    "org.junitpioneer.jupiter.RetryingTest", "io.github.artsok.RepeatedIfExceptionsTest"
  };
  private static final String JUPITER_TEST = "org.junit.jupiter.api.Test";
  private static final String TESTNG_TEST = "org.testng.annotations.Test";

  @Override
  public Description matchAnnotation(AnnotationTree tree, VisitorState state) {
    if (Support.isAnnotation(tree, RETRY)) {
      if (state.getSymbolFromString(JUPITER_TEST) == null) {
        return Description.NO_MATCH;
      }
      SuggestedFix.Builder fix = SuggestedFix.builder();
      String name = SuggestedFixes.qualifyType(state, fix, JUPITER_TEST);
      fix.replace(tree, "@" + name);
      List<int[]> removed = new ArrayList<>();
      for (TreePath path : Support.annotationPaths(state)) {
        if (path.getLeaf() instanceof AnnotationTree other && Support.isAnnotation(other, RETRY)) {
          removed.add(new int[] {Support.start(other), Support.end(other, state)});
        }
      }
      Support.dropImportIfUnused(fix, state, Support.simpleName(tree), removed);
      return describeMatch(tree, fix.build());
    }
    if (Support.isAnnotation(tree, TESTNG_TEST)) {
      return withoutRetryAnalyzer(tree, state);
    }
    return Description.NO_MATCH;
  }

  private Description withoutRetryAnalyzer(AnnotationTree tree, VisitorState state) {
    List<String> kept = new ArrayList<>();
    boolean found = false;
    for (ExpressionTree argument : tree.getArguments()) {
      if (argument instanceof AssignmentTree assignment
          && assignment.getVariable() instanceof IdentifierTree name
          && name.getName().contentEquals("retryAnalyzer")) {
        found = true;
      } else {
        kept.add(Support.source(argument, state));
      }
    }
    if (!found) {
      return Description.NO_MATCH;
    }
    String type = Support.source(tree.getAnnotationType(), state);
    return describeMatch(
        tree, SuggestedFix.replace(tree, "@" + type + (kept.isEmpty() ? "" : "(" + String.join(", ", kept) + ")")));
  }
}
