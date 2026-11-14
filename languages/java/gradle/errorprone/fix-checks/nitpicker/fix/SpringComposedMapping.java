package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.MethodTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.fixes.SuggestedFixes;
import com.google.errorprone.matchers.Description;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.AnnotationTree;
import com.sun.source.tree.AssignmentTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.MethodTree;
import com.sun.source.tree.NewArrayTree;
import com.sun.source.util.TreePath;
import com.sun.tools.javac.code.Symbol;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

@BugPattern(
    summary = "Uses @GetMapping, @PostMapping, @PutMapping, @PatchMapping or @DeleteMapping on a method.",
    severity = WARNING)
public final class SpringComposedMapping extends BugChecker implements MethodTreeMatcher {
  private static final String PACKAGE = "org.springframework.web.bind.annotation.";
  private static final String REQUEST_MAPPING = PACKAGE + "RequestMapping";
  private static final Map<String, String> COMPOSED =
      Map.of(
          "GET", "GetMapping",
          "POST", "PostMapping",
          "PUT", "PutMapping",
          "PATCH", "PatchMapping",
          "DELETE", "DeleteMapping");
  private static final String REQUEST_METHOD = PACKAGE + "RequestMethod";
  private static final Set<String> KEPT =
      Set.of("value", "path", "name", "params", "headers", "consumes", "produces");

  private record Plan(String verb, List<String> kept) {}

  @Override
  public Description matchMethod(MethodTree tree, VisitorState state) {
    for (AnnotationTree annotation : tree.getModifiers().getAnnotations()) {
      TreePath path = new TreePath(new TreePath(state.getPath(), tree.getModifiers()), annotation);
      Plan plan = plan(path, state);
      if (plan != null) {
        return describeMatch(annotation, fix(annotation, plan, state));
      }
    }
    return Description.NO_MATCH;
  }

  private static SuggestedFix fix(AnnotationTree annotation, Plan plan, VisitorState state) {
    SuggestedFix.Builder fix = SuggestedFix.builder();
    String name = SuggestedFixes.qualifyType(state, fix, PACKAGE + COMPOSED.get(plan.verb));
    List<String> kept = new ArrayList<>(plan.kept);
    if (kept.size() == 1 && kept.get(0).startsWith("value = ")) {
      kept.set(0, kept.get(0).substring("value = ".length()));
    }
    String arguments = kept.isEmpty() ? "" : "(" + String.join(", ", kept) + ")";
    fix.replace(annotation, "@" + name + arguments);
    List<int[]> removed = new ArrayList<>();
    for (TreePath path : Support.annotationPaths(state)) {
      if (plan(path, state) != null) {
        AnnotationTree other = (AnnotationTree) path.getLeaf();
        removed.add(new int[] {Support.start(other), Support.end(other, state)});
      }
    }
    Support.dropImportIfUnused(fix, state, "RequestMethod", removed);
    Support.dropImportIfUnused(fix, state, "RequestMapping", removed);
    return fix.build();
  }

  private static Plan plan(TreePath path, VisitorState state) {
    AnnotationTree annotation = (AnnotationTree) path.getLeaf();
    TreePath owner = path.getParentPath() == null ? null : path.getParentPath().getParentPath();
    if (!Support.isAnnotation(annotation, REQUEST_MAPPING) || owner == null || !(owner.getLeaf() instanceof MethodTree)) {
      return null;
    }
    String verb = null;
    List<String> kept = new ArrayList<>();
    for (ExpressionTree argument : annotation.getArguments()) {
      String name = "value";
      ExpressionTree value = argument;
      if (argument instanceof AssignmentTree assignment) {
        name = ((IdentifierTree) assignment.getVariable()).getName().toString();
        value = assignment.getExpression();
      }
      if (name.equals("method")) {
        verb = singleVerb(value);
        if (verb == null) {
          return null;
        }
      } else if (KEPT.contains(name)) {
        kept.add(name + " = " + Support.source(value, state));
      } else {
        return null;
      }
    }
    return verb != null && COMPOSED.containsKey(verb) ? new Plan(verb, kept) : null;
  }

  private static String singleVerb(ExpressionTree value) {
    ExpressionTree single = value;
    if (value instanceof NewArrayTree array) {
      if (array.getInitializers() == null || array.getInitializers().size() != 1) {
        return null;
      }
      single = array.getInitializers().get(0);
    }
    Symbol symbol = ASTHelpers.getSymbol(single);
    boolean verb =
        symbol != null && symbol.owner != null && symbol.owner.getQualifiedName().contentEquals(REQUEST_METHOD);
    return verb ? symbol.getSimpleName().toString() : null;
  }
}
