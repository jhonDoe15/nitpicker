package nitpicker.fix;

import com.google.errorprone.VisitorState;
import com.sun.source.tree.ArrayAccessTree;
import com.sun.source.tree.BinaryTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.InstanceOfTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.TypeCastTree;
import com.sun.source.tree.UnaryTree;

/** Operator precedence of Java expressions, used to parenthesize an operand only where it is needed. */
final class Precedence {
  static final int OR = 3;
  static final int AND = 4;
  static final int UNARY = 13;

  private Precedence() {}

  static int of(Tree tree) {
    return switch (tree.getKind()) {
      case ASSIGNMENT,
          MULTIPLY_ASSIGNMENT,
          DIVIDE_ASSIGNMENT,
          REMAINDER_ASSIGNMENT,
          PLUS_ASSIGNMENT,
          MINUS_ASSIGNMENT,
          LEFT_SHIFT_ASSIGNMENT,
          RIGHT_SHIFT_ASSIGNMENT,
          UNSIGNED_RIGHT_SHIFT_ASSIGNMENT,
          AND_ASSIGNMENT,
          XOR_ASSIGNMENT,
          OR_ASSIGNMENT,
          LAMBDA_EXPRESSION -> 1;
      case CONDITIONAL_EXPRESSION -> 2;
      case CONDITIONAL_OR -> OR;
      case CONDITIONAL_AND -> AND;
      case OR -> 5;
      case XOR -> 6;
      case AND -> 7;
      case EQUAL_TO, NOT_EQUAL_TO -> 8;
      case LESS_THAN, GREATER_THAN, LESS_THAN_EQUAL, GREATER_THAN_EQUAL, INSTANCE_OF -> 9;
      case LEFT_SHIFT, RIGHT_SHIFT, UNSIGNED_RIGHT_SHIFT -> 10;
      case PLUS, MINUS -> 11;
      case MULTIPLY, DIVIDE, REMAINDER -> 12;
      case LOGICAL_COMPLEMENT,
          BITWISE_COMPLEMENT,
          UNARY_PLUS,
          UNARY_MINUS,
          PREFIX_INCREMENT,
          PREFIX_DECREMENT,
          TYPE_CAST,
          SWITCH_EXPRESSION -> UNARY;
      case POSTFIX_INCREMENT, POSTFIX_DECREMENT -> 14;
      default -> 15;
    };
  }

  static String wrap(ExpressionTree tree, int minimum, VisitorState state) {
    String text = Support.source(tree, state);
    return of(tree) < minimum ? "(" + text + ")" : text;
  }

  static String negated(ExpressionTree tree, VisitorState state) {
    return negated(tree, 0, state);
  }

  static String negated(ExpressionTree tree, int minimum, VisitorState state) {
    if (tree instanceof UnaryTree unary && unary.getKind() == Tree.Kind.LOGICAL_COMPLEMENT) {
      return wrap(Support.unparenthesized(unary.getExpression()), minimum, state);
    }
    return "!" + wrap(tree, UNARY, state);
  }

  static String inContext(String text, int precedence, VisitorState state) {
    Tree parent = state.getPath().getParentPath().getLeaf();
    boolean operand = parent instanceof BinaryTree
        || parent instanceof UnaryTree
        || parent instanceof TypeCastTree
        || parent instanceof InstanceOfTree
        || parent instanceof MemberSelectTree
        || parent instanceof ArrayAccessTree;
    return operand && precedence <= of(parent) ? "(" + text + ")" : text;
  }
}
