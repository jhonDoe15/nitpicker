package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.BinaryTreeMatcher;
import com.google.errorprone.bugpatterns.BugChecker.MethodInvocationTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.matchers.Description;
import com.sun.source.tree.BinaryTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.LiteralTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.Tree;

@BugPattern(
    summary = "Loads an entity, or counts rows, only to learn whether a row exists.",
    severity = WARNING)
public final class EntityLoadedForExistence extends BugChecker
    implements MethodInvocationTreeMatcher, BinaryTreeMatcher {
  @Override
  public Description matchMethodInvocation(MethodInvocationTree tree, VisitorState state) {
    if (!(tree.getMethodSelect() instanceof MemberSelectTree select) || !tree.getArguments().isEmpty()) {
      return Description.NO_MATCH;
    }
    String method = select.getIdentifier().toString();
    if (!method.equals("isPresent") && !method.equals("isEmpty")) {
      return Description.NO_MATCH;
    }
    String exists = optionalFinder(select.getExpression(), state);
    return exists == null
        ? Description.NO_MATCH
        : describeMatch(tree, SuggestedFix.replace(tree, (method.equals("isEmpty") ? "!" : "") + exists));
  }

  @Override
  public Description matchBinary(BinaryTree tree, VisitorState state) {
    ExpressionTree left = Support.unparenthesized(tree.getLeftOperand());
    ExpressionTree right = Support.unparenthesized(tree.getRightOperand());
    Tree.Kind kind = tree.getKind();
    String exists = null;
    Boolean present = null;
    if (kind == Tree.Kind.EQUAL_TO || kind == Tree.Kind.NOT_EQUAL_TO) {
      ExpressionTree other = isNull(right) ? left : isNull(left) ? right : null;
      exists = other == null ? null : nullTested(other, state);
      present = kind == Tree.Kind.NOT_EQUAL_TO;
    }
    if (exists == null) {
      MethodInvocationTree count = left instanceof MethodInvocationTree call && constant(right) != null ? call : null;
      Integer value = count == null ? null : constant(right);
      Tree.Kind ordered = kind;
      if (count == null && right instanceof MethodInvocationTree call && constant(left) != null) {
        count = call;
        value = constant(left);
        ordered = Support.mirrored(kind);
      }
      Boolean empty = count == null || ordered == null ? null : Support.emptiness(ordered, value);
      exists = empty == null ? null : RepositoryCalls.existence(count, RepositoryCalls.Form.COUNT, state);
      present = empty == null ? null : !empty;
    }
    return exists == null
        ? Description.NO_MATCH
        : describeMatch(tree, SuggestedFix.replace(tree, (present ? "" : "!") + exists));
  }

  private static String nullTested(ExpressionTree tested, VisitorState state) {
    if (!(tested instanceof MethodInvocationTree call)) {
      return null;
    }
    if (call.getMethodSelect() instanceof MemberSelectTree select
        && select.getIdentifier().contentEquals("orElse")
        && call.getArguments().size() == 1
        && isNull(Support.unparenthesized(call.getArguments().get(0)))) {
      return optionalFinder(select.getExpression(), state);
    }
    return RepositoryCalls.existence(call, RepositoryCalls.Form.NULLABLE, state);
  }

  private static String optionalFinder(ExpressionTree tree, VisitorState state) {
    return Support.unparenthesized(tree) instanceof MethodInvocationTree call
        ? RepositoryCalls.existence(call, RepositoryCalls.Form.OPTIONAL, state)
        : null;
  }

  private static Integer constant(ExpressionTree tree) {
    if (Support.unparenthesized(tree) instanceof LiteralTree literal) {
      Object value = literal.getValue();
      if (value instanceof Integer number) {
        return number;
      }
      if (value instanceof Long number && number >= 0 && number <= 1) {
        return number.intValue();
      }
    }
    return null;
  }

  private static boolean isNull(ExpressionTree tree) {
    return tree.getKind() == Tree.Kind.NULL_LITERAL;
  }
}
