package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.AnnotationTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.matchers.Description;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.AnnotationTree;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.MethodTree;
import com.sun.source.tree.ModifiersTree;
import com.sun.source.tree.Tree;
import com.sun.source.util.TreePath;
import com.sun.tools.javac.code.Symbol;
import java.util.ArrayList;
import java.util.List;

@BugPattern(
    summary = "Removes a Generated annotation from hand-written code, which coverage and mutation tools then skip.",
    severity = WARNING)
public final class GeneratedOnHandWrittenCode extends BugChecker implements AnnotationTreeMatcher {
  @Override
  public Description matchAnnotation(AnnotationTree tree, VisitorState state) {
    if (!flagged(state.getPath())) {
      return Description.NO_MATCH;
    }
    int[] range = Support.removalRange(tree, state);
    SuggestedFix.Builder fix = SuggestedFix.builder().replace(range[0], range[1], "");
    List<int[]> all = new ArrayList<>();
    for (TreePath path : Support.annotationPaths(state)) {
      if (flagged(path) && Support.simpleName((AnnotationTree) path.getLeaf()).equals(Support.simpleName(tree))) {
        all.add(Support.removalRange((AnnotationTree) path.getLeaf(), state));
      }
    }
    Support.dropImportIfUnused(fix, state, Support.simpleName(tree), all);
    return describeMatch(tree, fix.build());
  }

  private static boolean flagged(TreePath path) {
    AnnotationTree tree = (AnnotationTree) path.getLeaf();
    String name = Support.simpleName(tree);
    if (!name.contains("Generated") || name.equals("GeneratedValue") || persistence(tree)) {
      return false;
    }
    TreePath modifiers = path.getParentPath();
    if (modifiers == null || !(modifiers.getLeaf() instanceof ModifiersTree) || modifiers.getParentPath() == null) {
      return false;
    }
    Tree owner = modifiers.getParentPath().getLeaf();
    return owner instanceof ClassTree || owner instanceof MethodTree;
  }

  private static boolean persistence(AnnotationTree tree) {
    Symbol symbol = ASTHelpers.getSymbol(tree);
    String name = symbol == null ? "" : symbol.getQualifiedName().toString();
    return name.startsWith("javax.persistence.") || name.startsWith("jakarta.persistence.");
  }
}
