package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.AnnotationTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.matchers.Description;
import com.sun.source.tree.AnnotationTree;
import com.sun.source.util.TreePath;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@BugPattern(
    summary = "Removes the annotation that hides code from mutation testing, so a test has to kill its mutants.",
    severity = WARNING)
public final class MutationIgnoreMarker extends BugChecker implements AnnotationTreeMatcher {
  private static final Set<String> NAMES = Set.of("DoNotMutate", "CoverageIgnore");

  @Override
  public Description matchAnnotation(AnnotationTree tree, VisitorState state) {
    String name = Support.simpleName(tree);
    if (!NAMES.contains(name)) {
      return Description.NO_MATCH;
    }
    int[] range = Support.removalRange(tree, state);
    SuggestedFix.Builder fix = SuggestedFix.builder().replace(range[0], range[1], "");
    List<int[]> all = new ArrayList<>();
    for (TreePath path : Support.annotationPaths(state)) {
      if (path.getLeaf() instanceof AnnotationTree other && NAMES.contains(Support.simpleName(other))) {
        all.add(Support.removalRange(other, state));
      }
    }
    Support.dropImportIfUnused(fix, state, name, all);
    return describeMatch(tree, fix.build());
  }
}
