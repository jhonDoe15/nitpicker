package nitpicker.fix;

import com.google.errorprone.VisitorState;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.BinaryTree;
import com.sun.source.tree.EnhancedForLoopTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.ForLoopTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.LiteralTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.ParenthesizedTree;
import com.sun.source.tree.StatementTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.UnaryTree;
import com.sun.source.tree.VariableTree;
import com.sun.source.tree.WhileLoopTree;
import com.sun.source.util.TreeScanner;
import com.sun.tools.javac.code.Symbol;
import com.sun.tools.javac.code.Type;
import java.util.Map;
import java.util.Set;
import javax.lang.model.type.TypeKind;

/** The test that tells, before a loop starts, whether it runs at least once. */
final class LoopEntry {
  private static final Set<String> SIZE_OWNERS = Set.of("java.util.Collection", "java.util.Map", "java.lang.CharSequence");
  private static final Set<String> SIZES = Set.of("size", "isEmpty", "length");
  private static final Map<Tree.Kind, String> COMPARISONS = Map.of(
      Tree.Kind.LESS_THAN, "<", Tree.Kind.LESS_THAN_EQUAL, "<=", Tree.Kind.GREATER_THAN, ">",
      Tree.Kind.GREATER_THAN_EQUAL, ">=", Tree.Kind.NOT_EQUAL_TO, "!=");

  private static final Map<Tree.Kind, String> OPPOSITES = Map.of(
      Tree.Kind.LESS_THAN, ">=", Tree.Kind.LESS_THAN_EQUAL, ">", Tree.Kind.GREATER_THAN, "<=",
      Tree.Kind.GREATER_THAN_EQUAL, "<", Tree.Kind.NOT_EQUAL_TO, "==", Tree.Kind.EQUAL_TO, "!=");

  private static final Set<TypeKind> WHOLE =
      Set.of(TypeKind.INT, TypeKind.LONG, TypeKind.SHORT, TypeKind.BYTE, TypeKind.CHAR);

  private LoopEntry() {}

  /** Source of the condition that holds exactly when the loop body does not run, or null when only a negation tells. */
  static String skipped(StatementTree loop, VisitorState state) {
    if (condition(loop, state) == null) {
      return null;
    }
    if (loop instanceof EnhancedForLoopTree each) {
      ExpressionTree plain = Support.unparenthesized(each.getExpression());
      String source = Support.source(plain, state);
      return ASTHelpers.getType(plain).getKind() == TypeKind.ARRAY ? source + ".length == 0" : source + ".isEmpty()";
    }
    if (loop instanceof ForLoopTree counted) {
      BinaryTree test = (BinaryTree) Support.unparenthesized(counted.getCondition());
      VariableTree variable = (VariableTree) counted.getInitializer().get(0);
      return opposite(test, Support.unparenthesized(variable.getInitializer()), state);
    }
    ExpressionTree test = Support.unparenthesized(((WhileLoopTree) loop).getCondition());
    if (test instanceof UnaryTree negated && negated.getKind() == Tree.Kind.LOGICAL_COMPLEMENT) {
      return Support.source(Support.unparenthesized(negated.getExpression()), state);
    }
    return test instanceof BinaryTree compared && OPPOSITES.containsKey(compared.getKind())
        ? opposite(compared, compared.getLeftOperand(), state)
        : "!(" + Support.source(test, state) + ")";
  }

  private static String opposite(BinaryTree test, ExpressionTree left, VisitorState state) {
    boolean exact = WHOLE.contains(kindOf(left)) && WHOLE.contains(kindOf(test.getRightOperand()));
    return exact
        ? Support.source(left, state) + " " + OPPOSITES.get(test.getKind()) + " "
            + Support.source(test.getRightOperand(), state)
        : null;
  }

  private static TypeKind kindOf(ExpressionTree tree) {
    Type type = ASTHelpers.getType(tree);
    return type == null ? TypeKind.NONE : type.getKind();
  }

  /** Source of a side-effect-free condition that holds exactly when the loop body runs, or null. */
  static String condition(StatementTree loop, VisitorState state) {
    if (loop instanceof EnhancedForLoopTree each) {
      return iterated(each.getExpression(), state);
    }
    if (loop instanceof WhileLoopTree whileLoop) {
      ExpressionTree test = Support.unparenthesized(whileLoop.getCondition());
      return pure(test, null, state) ? Support.source(test, state) : null;
    }
    return loop instanceof ForLoopTree counted ? counted(counted, state) : null;
  }

  private static String iterated(ExpressionTree expression, VisitorState state) {
    ExpressionTree plain = Support.unparenthesized(expression);
    Type type = ASTHelpers.getType(plain);
    if (type == null || !named(plain)) {
      return null;
    }
    String source = Support.source(plain, state);
    if (type.getKind() == TypeKind.ARRAY) {
      return source + ".length > 0";
    }
    return isA(type, "java.util.Collection", state) ? "!" + source + ".isEmpty()" : null;
  }

  private static String counted(ForLoopTree loop, VisitorState state) {
    if (loop.getInitializer().size() != 1
        || !(loop.getInitializer().get(0) instanceof VariableTree variable)
        || !(Support.unparenthesized(variable.getInitializer()) instanceof LiteralTree first)
        || !(Support.unparenthesized(loop.getCondition()) instanceof BinaryTree test)
        || !COMPARISONS.containsKey(test.getKind())
        || !(Support.unparenthesized(test.getLeftOperand()) instanceof IdentifierTree counter)
        || ASTHelpers.getSymbol(counter) != ASTHelpers.getSymbol(variable)
        || !pure(test.getRightOperand(), ASTHelpers.getSymbol(variable), state)) {
      return null;
    }
    return Support.source(first, state) + " " + COMPARISONS.get(test.getKind()) + " "
        + Support.source(test.getRightOperand(), state);
  }

  private static boolean named(ExpressionTree tree) {
    boolean plain = tree instanceof IdentifierTree
        || tree instanceof MemberSelectTree select && select.getExpression() instanceof IdentifierTree owner
            && owner.getName().contentEquals("this");
    return plain && ASTHelpers.getSymbol(tree) instanceof Symbol.VarSymbol;
  }

  private static boolean pure(Tree tree, Symbol excluded, VisitorState state) {
    boolean[] ok = {true};
    new TreeScanner<Void, Void>() {
      @Override
      public Void scan(Tree node, Void unused) {
        if (node == null) {
          return null;
        }
        if (node instanceof IdentifierTree identifier) {
          Symbol symbol = ASTHelpers.getSymbol(identifier);
          ok[0] &= symbol instanceof Symbol.VarSymbol && symbol != excluded;
          return null;
        }
        if (node instanceof LiteralTree) {
          return null;
        }
        if (node instanceof MemberSelectTree select) {
          ok[0] &= ASTHelpers.getSymbol(select) instanceof Symbol.VarSymbol;
          return scan(select.getExpression(), null);
        }
        if (node instanceof MethodInvocationTree call) {
          ok[0] &= call.getArguments().isEmpty() && call.getMethodSelect() instanceof MemberSelectTree select
              && SIZES.contains(select.getIdentifier().toString()) && named(select.getExpression())
              && SIZE_OWNERS.stream().anyMatch(owner -> isA(ASTHelpers.getType(select.getExpression()), owner, state));
          return null;
        }
        boolean operator = node instanceof BinaryTree || node instanceof ParenthesizedTree
            || node instanceof UnaryTree unary && Set.of(Tree.Kind.LOGICAL_COMPLEMENT, Tree.Kind.UNARY_MINUS)
                .contains(unary.getKind());
        ok[0] &= operator;
        return operator ? super.scan(node, null) : null;
      }
    }.scan(tree, null);
    return ok[0];
  }

  private static boolean isA(Type type, String name, VisitorState state) {
    Type wanted = state.getTypeFromString(name);
    return type != null && wanted != null
        && ASTHelpers.isSubtype(state.getTypes().erasure(type), state.getTypes().erasure(wanted), state);
  }
}
