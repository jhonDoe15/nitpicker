package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.IfTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.matchers.Description;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.BlockTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.IfTree;
import com.sun.source.tree.LambdaExpressionTree;
import com.sun.source.tree.LiteralTree;
import com.sun.source.tree.MethodTree;
import com.sun.source.tree.ParenthesizedTree;
import com.sun.source.tree.ReturnTree;
import com.sun.source.tree.StatementTree;
import com.sun.source.tree.Tree;
import com.sun.source.util.TreePath;
import java.util.List;
import javax.lang.model.type.TypeKind;

@BugPattern(
    summary = "Returns the condition itself instead of branching to a true or false return.",
    severity = WARNING)
public final class SimplifyBooleanReturns extends BugChecker implements IfTreeMatcher {
  @Override
  public Description matchIf(IfTree tree, VisitorState state) {
    if (!returnsPrimitiveBoolean(state)) {
      return Description.NO_MATCH;
    }
    Boolean first = returned(tree.getThenStatement());
    if (first == null) {
      return Description.NO_MATCH;
    }
    int end;
    Boolean second;
    if (tree.getElseStatement() != null) {
      second = returned(tree.getElseStatement());
      end = Support.end(tree, state);
    } else {
      ReturnTree next = nextReturn(tree, state);
      second = next == null ? null : returned(next);
      end = next == null ? -1 : Support.end(next, state);
      if (second != null && hasComment(Support.end(tree, state), Support.start(next), state)) {
        return Description.NO_MATCH;
      }
    }
    if (second == null || first.equals(second) || holdsComment(tree, end, state)) {
      return Description.NO_MATCH;
    }
    ParenthesizedTree condition = (ParenthesizedTree) tree.getCondition();
    ExpressionTree test = condition.getExpression();
    String value = first ? Support.source(test, state) : Precedence.negated(test, state);
    return describeMatch(tree, SuggestedFix.replace(Support.start(tree), end, "return " + value + ";"));
  }

  private static boolean holdsComment(IfTree tree, int end, VisitorState state) {
    ParenthesizedTree condition = (ParenthesizedTree) tree.getCondition();
    ExpressionTree test = condition.getExpression();
    int conditionEnd = Support.end(condition, state);
    return hasComment(Support.start(tree), Support.start(test), state)
        || hasComment(Support.end(test, state), conditionEnd, state)
        || hasComment(conditionEnd, end, state);
  }

  private static boolean hasComment(int from, int to, VisitorState state) {
    return state.getSourceCode().subSequence(from, to).toString().contains("/");
  }

  private static ReturnTree nextReturn(IfTree tree, VisitorState state) {
    if (!(state.getPath().getParentPath().getLeaf() instanceof BlockTree block)) {
      return null;
    }
    List<? extends StatementTree> statements = block.getStatements();
    int index = statements.indexOf(tree);
    return index >= 0 && index + 1 < statements.size() && statements.get(index + 1) instanceof ReturnTree next
        ? next
        : null;
  }

  private static Boolean returned(StatementTree statement) {
    StatementTree single = statement;
    if (single instanceof BlockTree block) {
      single = block.getStatements().size() == 1 ? block.getStatements().get(0) : null;
    }
    if (single instanceof ReturnTree result
        && result.getExpression() instanceof LiteralTree literal
        && literal.getValue() instanceof Boolean value) {
      return value;
    }
    return null;
  }

  private static boolean returnsPrimitiveBoolean(VisitorState state) {
    for (TreePath path = state.getPath(); path != null; path = path.getParentPath()) {
      Tree leaf = path.getLeaf();
      if (leaf instanceof LambdaExpressionTree) {
        return false;
      }
      if (leaf instanceof MethodTree method) {
        return method.getReturnType() != null
            && ASTHelpers.getType(method.getReturnType()) != null
            && ASTHelpers.getType(method.getReturnType()).getKind() == TypeKind.BOOLEAN;
      }
    }
    return false;
  }
}
