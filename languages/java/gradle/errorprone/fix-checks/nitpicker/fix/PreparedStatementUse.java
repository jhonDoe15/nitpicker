package nitpicker.fix;

import com.google.errorprone.VisitorState;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.BreakTree;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.ContinueTree;
import com.sun.source.tree.DoWhileLoopTree;
import com.sun.source.tree.EnhancedForLoopTree;
import com.sun.source.tree.ExpressionStatementTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.ForLoopTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.LambdaExpressionTree;
import com.sun.source.tree.LiteralTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.ParenthesizedTree;
import com.sun.source.tree.ReturnTree;
import com.sun.source.tree.StatementTree;
import com.sun.source.tree.SwitchExpressionTree;
import com.sun.source.tree.SwitchTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.TryTree;
import com.sun.source.tree.BinaryTree;
import com.sun.source.tree.VariableTree;
import com.sun.source.tree.WhileLoopTree;
import com.sun.source.util.TreeScanner;
import com.sun.tools.javac.code.Symbol;
import com.sun.tools.javac.code.Type;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/** Decides whether a statement prepared on each pass can be prepared once around the loop. */
final class PreparedStatementUse {
  private static final Set<String> SETTERS =
      Set.of(
          "setNull", "setBoolean", "setByte", "setShort", "setInt", "setLong", "setFloat", "setDouble",
          "setBigDecimal", "setString", "setBytes", "setDate", "setTime", "setTimestamp", "setObject",
          "setURL", "setNString");
  private static final Set<String> EXECUTES = Set.of("executeUpdate", "execute", "executeQuery");
  private static final Pattern QUOTED = Pattern.compile("'(?:[^']|'')*'|\"[^\"]*\"");

  private PreparedStatementUse() {}

  static boolean reusable(StatementTree loop, TryTree tryTree, VariableTree resource, VisitorState state) {
    if (!(Support.unparenthesized(resource.getInitializer()) instanceof MethodInvocationTree prepare)
        || !(prepare.getMethodSelect() instanceof MemberSelectTree select)
        || !select.getIdentifier().contentEquals("prepareStatement")
        || prepare.getArguments().isEmpty()) {
      return false;
    }
    Type receiver = ASTHelpers.getType(select.getExpression());
    Symbol statement = ASTHelpers.getSymbol(resource);
    Symbol connection = variable(select.getExpression());
    String sql = ASTHelpers.constValue(prepare.getArguments().get(0), String.class);
    if (receiver == null
        || statement == null
        || connection == null
        || sql == null
        || !ASTHelpers.isSubtype(receiver, state.getTypeFromString("java.sql.Connection"), state)) {
      return false;
    }
    Set<Symbol> inside = declared(loop);
    if (!invariant(select.getExpression(), inside)) {
      return false;
    }
    for (ExpressionTree argument : prepare.getArguments()) {
      if (!invariant(argument, inside)) {
        return false;
      }
    }
    int placeholders = placeholders(sql);
    return placeholders >= 0
        && !mentions(headerOf(loop), resource.getName().toString())
        && usesAllowed(tryTree, statement, connection, placeholders)
        && jumpsAllowed(tryTree);
  }

  private static Symbol variable(ExpressionTree tree) {
    ExpressionTree plain = Support.unparenthesized(tree);
    boolean named =
        plain instanceof IdentifierTree
            || plain instanceof MemberSelectTree select
                && select.getExpression() instanceof IdentifierTree owner
                && owner.getName().contentEquals("this");
    Symbol symbol = named ? ASTHelpers.getSymbol(plain) : null;
    return symbol instanceof Symbol.VarSymbol ? symbol : null;
  }

  private static Set<Symbol> declared(Tree loop) {
    Set<Symbol> symbols = new HashSet<>();
    new TreeScanner<Void, Void>() {
      @Override
      public Void visitVariable(VariableTree node, Void unused) {
        Symbol symbol = ASTHelpers.getSymbol(node);
        if (symbol != null) {
          symbols.add(symbol);
        }
        return super.visitVariable(node, unused);
      }
    }.scan(loop, null);
    return symbols;
  }

  private static boolean invariant(ExpressionTree tree, Set<Symbol> inside) {
    ExpressionTree plain = Support.unparenthesized(tree);
    if (ASTHelpers.constValue(plain) != null) {
      return true;
    }
    if (plain instanceof BinaryTree binary && binary.getKind() == Tree.Kind.PLUS) {
      return invariant(binary.getLeftOperand(), inside) && invariant(binary.getRightOperand(), inside);
    }
    Symbol symbol = variable(plain);
    return symbol != null && !inside.contains(symbol) && ASTHelpers.isConsideredFinal(symbol);
  }

  private static List<Tree> headerOf(StatementTree loop) {
    if (loop instanceof ForLoopTree tree) {
      return java.util.stream.Stream.concat(
              java.util.stream.Stream.concat(tree.getInitializer().stream(), java.util.stream.Stream.of(tree.getCondition())),
              tree.getUpdate().stream())
          .filter(java.util.Objects::nonNull)
          .map(Tree.class::cast)
          .toList();
    }
    if (loop instanceof EnhancedForLoopTree tree) {
      return List.of(tree.getVariable(), tree.getExpression());
    }
    return List.of(((WhileLoopTree) loop).getCondition());
  }

  private static boolean mentions(List<Tree> trees, String name) {
    boolean[] found = {false};
    TreeScanner<Void, Void> scanner =
        new TreeScanner<>() {
          @Override
          public Void visitIdentifier(IdentifierTree node, Void unused) {
            found[0] |= node.getName().contentEquals(name);
            return null;
          }
        };
    trees.forEach(tree -> scanner.scan(tree, null));
    return found[0];
  }

  static int placeholders(String sql) {
    if (sql.contains("--") || sql.contains("/*") || sql.contains("??") || sql.contains("$$")
        || sql.contains("?|") || sql.contains("?&") || sql.contains("\\")) {
      return -1;
    }
    String stripped = QUOTED.matcher(sql).replaceAll(" ");
    if (stripped.indexOf('\'') >= 0 || stripped.indexOf('"') >= 0) {
      return -1;
    }
    return (int) stripped.chars().filter(c -> c == '?').count();
  }

  private static boolean usesAllowed(TryTree tryTree, Symbol statement, Symbol connection, int placeholders) {
    List<? extends StatementTree> statements = tryTree.getBlock().getStatements();
    Set<Integer> indexes = new HashSet<>();
    int next = 0;
    while (next < statements.size() && setterIndex(statements.get(next), statement) > 0) {
      if (!indexes.add(setterIndex(statements.get(next), statement))) {
        return false;
      }
      next++;
    }
    for (int index = 1; index <= placeholders; index++) {
      if (!indexes.contains(index)) {
        return false;
      }
    }
    if (indexes.size() != placeholders || next >= statements.size()) {
      return false;
    }
    boolean[] executed = {false};
    boolean[] ok = {true};
    TreeScanner<Void, Integer> scanner =
        new TreeScanner<>() {
          @Override
          public Void visitIdentifier(IdentifierTree node, Integer nested) {
            Symbol symbol = ASTHelpers.getSymbol(node);
            ok[0] &= symbol != connection;
            ok[0] &= symbol != statement;
            return null;
          }

          @Override
          public Void visitMethodInvocation(MethodInvocationTree node, Integer nested) {
            if (node.getMethodSelect() instanceof MemberSelectTree select
                && select.getExpression() instanceof IdentifierTree receiver
                && ASTHelpers.getSymbol(receiver) == statement) {
              boolean execute = EXECUTES.contains(select.getIdentifier().toString()) && node.getArguments().isEmpty();
              ok[0] &= execute && nested == 0;
              executed[0] |= execute;
              return null;
            }
            return super.visitMethodInvocation(node, nested);
          }

          @Override
          public Void visitLambdaExpression(LambdaExpressionTree node, Integer nested) {
            return super.visitLambdaExpression(node, nested + 1);
          }

          @Override
          public Void visitClass(ClassTree node, Integer nested) {
            return super.visitClass(node, nested + 1);
          }
        };
    for (int index = 0; index < statements.size(); index++) {
      if (index < next) {
        MethodInvocationTree setter = (MethodInvocationTree) ((ExpressionStatementTree) statements.get(index)).getExpression();
        for (ExpressionTree argument : setter.getArguments().subList(1, setter.getArguments().size())) {
          scanner.scan(argument, 0);
        }
      } else {
        scanner.scan(statements.get(index), 0);
      }
    }
    return ok[0] && executed[0];
  }

  private static int setterIndex(StatementTree statement, Symbol resource) {
    if (statement instanceof ExpressionStatementTree expression
        && expression.getExpression() instanceof MethodInvocationTree call
        && call.getMethodSelect() instanceof MemberSelectTree select
        && select.getExpression() instanceof IdentifierTree receiver
        && ASTHelpers.getSymbol(receiver) == resource
        && SETTERS.contains(select.getIdentifier().toString())
        && call.getArguments().size() >= 2
        && call.getArguments().get(0) instanceof LiteralTree literal
        && literal.getValue() instanceof Integer index) {
      return index;
    }
    return 0;
  }

  private static boolean jumpsAllowed(TryTree tryTree) {
    boolean[] ok = {true};
    new TreeScanner<Void, Integer>() {
      @Override
      public Void visitReturn(ReturnTree node, Integer depth) {
        ok[0] = false;
        return null;
      }

      @Override
      public Void visitBreak(BreakTree node, Integer depth) {
        ok[0] &= node.getLabel() == null && depth > 0;
        return null;
      }

      @Override
      public Void visitContinue(ContinueTree node, Integer depth) {
        ok[0] &= node.getLabel() == null;
        return null;
      }

      @Override
      public Void visitLambdaExpression(LambdaExpressionTree node, Integer depth) {
        return null;
      }

      @Override
      public Void visitClass(ClassTree node, Integer depth) {
        return null;
      }

      @Override
      public Void visitForLoop(ForLoopTree node, Integer depth) {
        return super.visitForLoop(node, depth + 1);
      }

      @Override
      public Void visitEnhancedForLoop(EnhancedForLoopTree node, Integer depth) {
        return super.visitEnhancedForLoop(node, depth + 1);
      }

      @Override
      public Void visitWhileLoop(WhileLoopTree node, Integer depth) {
        return super.visitWhileLoop(node, depth + 1);
      }

      @Override
      public Void visitDoWhileLoop(DoWhileLoopTree node, Integer depth) {
        return super.visitDoWhileLoop(node, depth + 1);
      }

      @Override
      public Void visitSwitch(SwitchTree node, Integer depth) {
        return super.visitSwitch(node, depth + 1);
      }

      @Override
      public Void visitSwitchExpression(SwitchExpressionTree node, Integer depth) {
        return super.visitSwitchExpression(node, depth + 1);
      }
    }.scan(tryTree.getBlock(), 0);
    return ok[0];
  }
}
