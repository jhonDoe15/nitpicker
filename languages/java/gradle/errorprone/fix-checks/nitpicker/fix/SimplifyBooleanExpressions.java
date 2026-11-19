package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.BinaryTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.matchers.Description;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.BinaryTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.LiteralTree;
import com.sun.source.tree.Tree;
import javax.lang.model.type.TypeKind;

@BugPattern(
    summary = "Drops the comparison of a boolean with a boolean literal.",
    severity = WARNING)
public final class SimplifyBooleanExpressions extends BugChecker implements BinaryTreeMatcher {
  @Override
  public Description matchBinary(BinaryTree tree, VisitorState state) {
    Tree.Kind kind = tree.getKind();
    if (kind != Tree.Kind.EQUAL_TO && kind != Tree.Kind.NOT_EQUAL_TO) {
      return Description.NO_MATCH;
    }
    ExpressionTree left = tree.getLeftOperand();
    ExpressionTree right = tree.getRightOperand();
    Boolean literal = literal(right);
    ExpressionTree operand = left;
    if (literal == null) {
      literal = literal(left);
      operand = right;
    }
    if (literal == null || !isPrimitiveBoolean(operand) || hasComment(left, right, state)) {
      return Description.NO_MATCH;
    }
    boolean keep = (kind == Tree.Kind.EQUAL_TO) == literal;
    String text = keep
        ? Support.source(operand, state)
        : "!" + Precedence.wrap(operand, Precedence.UNARY, state);
    int precedence = keep ? Precedence.of(operand) : Precedence.UNARY;
    return describeMatch(tree, SuggestedFix.replace(tree, Precedence.inContext(text, precedence, state)));
  }

  private static boolean hasComment(ExpressionTree left, ExpressionTree right, VisitorState state) {
    return state
        .getSourceCode()
        .subSequence(Support.end(left, state), Support.start(right))
        .toString()
        .contains("/");
  }

  private static Boolean literal(ExpressionTree tree) {
    return tree instanceof LiteralTree literal && literal.getValue() instanceof Boolean value ? value : null;
  }

  private static boolean isPrimitiveBoolean(ExpressionTree tree) {
    return ASTHelpers.getType(tree) != null && ASTHelpers.getType(tree).getKind() == TypeKind.BOOLEAN;
  }
}
