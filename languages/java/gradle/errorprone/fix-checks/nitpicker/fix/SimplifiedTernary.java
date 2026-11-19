package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.ConditionalExpressionTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.matchers.Description;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.ConditionalExpressionTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.LiteralTree;
import javax.lang.model.type.TypeKind;

@BugPattern(
    summary = "Writes a boolean ternary with a boolean literal branch as a logical expression.",
    severity = WARNING)
public final class SimplifiedTernary extends BugChecker implements ConditionalExpressionTreeMatcher {
  private record Rewrite(String text, int precedence) {}

  @Override
  public Description matchConditionalExpression(ConditionalExpressionTree tree, VisitorState state) {
    if (!isBoolean(tree)
        || !isBoolean(tree.getTrueExpression())
        || !isBoolean(tree.getFalseExpression())
        || hasComment(tree, state)) {
      return Description.NO_MATCH;
    }
    Boolean onTrue = literal(tree.getTrueExpression());
    Rewrite rewrite = rewrite(tree, onTrue, literal(tree.getFalseExpression()), state);
    if (rewrite == null) {
      return Description.NO_MATCH;
    }
    String text = Precedence.inContext(rewrite.text(), rewrite.precedence(), state);
    return describeMatch(tree, SuggestedFix.replace(tree, text));
  }

  private static Rewrite rewrite(
      ConditionalExpressionTree tree, Boolean onTrue, Boolean onFalse, VisitorState state) {
    ExpressionTree condition = tree.getCondition();
    if (onTrue != null && onFalse != null) {
      if (onTrue.equals(onFalse) || !isBoolean(condition)) {
        return null;
      }
      return onTrue
          ? new Rewrite(Support.source(condition, state), Precedence.of(condition))
          : new Rewrite(Precedence.negated(condition, Precedence.UNARY, state), Precedence.UNARY);
    }
    boolean literalOnTrueSide = onTrue != null;
    Boolean value = literalOnTrueSide ? onTrue : onFalse;
    if (value == null) {
      return null;
    }
    ExpressionTree other = literalOnTrueSide ? tree.getFalseExpression() : tree.getTrueExpression();
    int precedence = value ? Precedence.OR : Precedence.AND;
    String head = literalOnTrueSide == value
        ? Precedence.wrap(condition, precedence, state)
        : Precedence.negated(condition, precedence, state);
    String operator = value ? " || " : " && ";
    return new Rewrite(head + operator + Precedence.wrap(other, precedence, state), precedence);
  }

  private static boolean hasComment(ConditionalExpressionTree tree, VisitorState state) {
    CharSequence text = state.getSourceCode();
    ExpressionTree whenTrue = tree.getTrueExpression();
    String first = text.subSequence(Support.end(tree.getCondition(), state), Support.start(whenTrue)).toString();
    String second = text
        .subSequence(Support.end(whenTrue, state), Support.start(tree.getFalseExpression()))
        .toString();
    return first.contains("/") || second.contains("/");
  }

  private static Boolean literal(ExpressionTree tree) {
    return tree instanceof LiteralTree literal && literal.getValue() instanceof Boolean value ? value : null;
  }

  private static boolean isBoolean(ExpressionTree tree) {
    return ASTHelpers.getType(tree) != null && ASTHelpers.getType(tree).getKind() == TypeKind.BOOLEAN;
  }
}
