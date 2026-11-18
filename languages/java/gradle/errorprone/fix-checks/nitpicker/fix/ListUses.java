package nitpicker.fix;

import com.google.errorprone.VisitorState;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.AssignmentTree;
import com.sun.source.tree.BinaryTree;
import com.sun.source.tree.BlockTree;
import com.sun.source.tree.BreakTree;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.CompoundAssignmentTree;
import com.sun.source.tree.ContinueTree;
import com.sun.source.tree.DoWhileLoopTree;
import com.sun.source.tree.EnhancedForLoopTree;
import com.sun.source.tree.ExpressionStatementTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.ForLoopTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.IfTree;
import com.sun.source.tree.LambdaExpressionTree;
import com.sun.source.tree.LiteralTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.ReturnTree;
import com.sun.source.tree.StatementTree;
import com.sun.source.tree.ThrowTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.UnaryTree;
import com.sun.source.tree.WhileLoopTree;
import com.sun.source.util.TreePath;
import com.sun.source.util.TreePathScanner;
import com.sun.source.util.TreeScanner;
import com.sun.tools.javac.code.Symbol;
import java.util.ArrayList;
import java.util.List;
import javax.lang.model.element.ElementKind;

final class ListUses {
  private final Symbol.VarSymbol local;
  private final VisitorState state;
  private final List<TreePath> adds = new ArrayList<>();
  private boolean escapes;
  private boolean observed;
  private boolean searchedInLoop;

  private ListUses(Symbol.VarSymbol local, VisitorState state) {
    this.local = local;
    this.state = state;
  }

  static boolean onlyAddedAndSearched(
      Symbol.VarSymbol local, TreePath block, List<? extends StatementTree> following, VisitorState state) {
    ListUses uses = new ListUses(local, state);
    TreePathScanner<Void, Void> scanner =
        new TreePathScanner<>() {
          @Override
          public Void visitIdentifier(IdentifierTree node, Void unused) {
            if (ASTHelpers.getSymbol(node) == local) {
              uses.classify(getCurrentPath(), block);
            }
            return null;
          }
        };
    for (StatementTree statement : following) {
      scanner.scan(new TreePath(block, statement), null);
    }
    return uses.accepted();
  }

  private boolean accepted() {
    if (escapes || adds.isEmpty() || !searchedInLoop) {
      return false;
    }
    return !observed || adds.stream().allMatch(this::guarded);
  }

  private void classify(TreePath use, TreePath block) {
    Tree parent = use.getParentPath().getLeaf();
    boolean inLambda = false;
    for (TreePath up = use.getParentPath(); up != null && up != block; up = up.getParentPath()) {
      escapes |= up.getLeaf() instanceof ClassTree;
      inLambda |= up.getLeaf() instanceof LambdaExpressionTree;
    }
    if (parent instanceof EnhancedForLoopTree loop && loop.getExpression() == use.getLeaf()) {
      observed = true;
      escapes |= inLambda;
      return;
    }
    if (!(parent instanceof MemberSelectTree select)
        || select.getExpression() != use.getLeaf()
        || !(use.getParentPath().getParentPath().getLeaf() instanceof MethodInvocationTree call)
        || call.getMethodSelect() != select) {
      escapes = true;
      return;
    }
    String name = select.getIdentifier().toString();
    int arguments = call.getArguments().size();
    TreePath callPath = use.getParentPath().getParentPath();
    boolean statement = callPath.getParentPath().getLeaf() instanceof ExpressionStatementTree;
    switch (name) {
      case "add" -> {
        escapes |= arguments != 1 || !statement;
        adds.add(callPath.getParentPath());
      }
      case "contains" -> {
        escapes |= arguments != 1;
        searchedInLoop |= inLambda || insideLoop(use, block);
      }
      case "isEmpty" -> escapes |= arguments != 0 || inLambda;
      case "stream" -> {
        escapes |= arguments != 0 || inLambda;
        observed = true;
      }
      case "remove" -> {
        Symbol.MethodSymbol method = ASTHelpers.getSymbol(call);
        escapes |= arguments != 1 || inLambda || method == null || method.params().get(0).type.isPrimitive();
        observed = true;
      }
      default -> escapes = true;
    }
  }

  private static boolean insideLoop(TreePath use, TreePath block) {
    for (TreePath up = use.getParentPath(); up != null && up != block; up = up.getParentPath()) {
      Tree leaf = up.getLeaf();
      if (leaf instanceof ForLoopTree
          || leaf instanceof EnhancedForLoopTree
          || leaf instanceof WhileLoopTree
          || leaf instanceof DoWhileLoopTree) {
        return true;
      }
    }
    return false;
  }

  private boolean guarded(TreePath statementPath) {
    MethodInvocationTree add = (MethodInvocationTree) ((ExpressionStatementTree) statementPath.getLeaf()).getExpression();
    ExpressionTree value = Support.unparenthesized(add.getArguments().get(0));
    if (!stable(value)) {
      return false;
    }
    String text = text(value);
    Tree parent = statementPath.getParentPath().getLeaf();
    if (parent instanceof IfTree branch) {
      return branchGuard(branch, statementPath.getLeaf(), text, value);
    }
    if (!(parent instanceof BlockTree block)) {
      return false;
    }
    List<? extends StatementTree> statements = block.getStatements();
    int index = statements.indexOf(statementPath.getLeaf());
    if (index == 0 && statementPath.getParentPath().getParentPath().getLeaf() instanceof IfTree branch) {
      return branchGuard(branch, block, text, value);
    }
    return index > 0
        && statements.get(index - 1) instanceof IfTree before
        && before.getElseStatement() == null
        && abrupt(before.getThenStatement())
        && searches(Support.unparenthesized(before.getCondition()), text);
  }

  private boolean branchGuard(IfTree branch, Tree taken, String text, ExpressionTree value) {
    ExpressionTree condition = Support.unparenthesized(branch.getCondition());
    if (branch.getElseStatement() == taken) {
      return searches(condition, text);
    }
    if (branch.getThenStatement() != taken) {
      return false;
    }
    List<ExpressionTree> conjuncts = new ArrayList<>();
    flatten(condition, conjuncts);
    boolean found = false;
    for (ExpressionTree conjunct : conjuncts) {
      if (conjunct instanceof UnaryTree negated
          && negated.getKind() == Tree.Kind.LOGICAL_COMPLEMENT
          && searches(Support.unparenthesized(negated.getExpression()), text)) {
        found = true;
      } else if (mutates(conjunct)) {
        return false;
      }
    }
    boolean variable = value instanceof IdentifierTree && ASTHelpers.getSymbol(value) instanceof Symbol.VarSymbol symbol
        && symbol.getKind() != ElementKind.FIELD;
    return found && (variable || conjuncts.size() == 1);
  }

  private static void flatten(ExpressionTree tree, List<ExpressionTree> into) {
    ExpressionTree current = Support.unparenthesized(tree);
    if (current instanceof BinaryTree binary && binary.getKind() == Tree.Kind.CONDITIONAL_AND) {
      flatten(binary.getLeftOperand(), into);
      flatten(binary.getRightOperand(), into);
    } else {
      into.add(current);
    }
  }

  private static boolean mutates(ExpressionTree tree) {
    boolean[] found = {false};
    new TreeScanner<Void, Void>() {
      @Override
      public Void visitAssignment(AssignmentTree node, Void unused) {
        found[0] = true;
        return null;
      }

      @Override
      public Void visitCompoundAssignment(CompoundAssignmentTree node, Void unused) {
        found[0] = true;
        return null;
      }

      @Override
      public Void visitUnary(UnaryTree node, Void unused) {
        Tree.Kind kind = node.getKind();
        found[0] |= kind == Tree.Kind.POSTFIX_INCREMENT
            || kind == Tree.Kind.POSTFIX_DECREMENT
            || kind == Tree.Kind.PREFIX_INCREMENT
            || kind == Tree.Kind.PREFIX_DECREMENT;
        return super.visitUnary(node, unused);
      }
    }.scan(tree, null);
    return found[0];
  }

  private boolean searches(ExpressionTree tree, String text) {
    return tree instanceof MethodInvocationTree call
        && call.getMethodSelect() instanceof MemberSelectTree select
        && select.getIdentifier().contentEquals("contains")
        && select.getExpression() instanceof IdentifierTree receiver
        && ASTHelpers.getSymbol(receiver) == local
        && call.getArguments().size() == 1
        && text(Support.unparenthesized(call.getArguments().get(0))).equals(text);
  }

  private static boolean abrupt(StatementTree tree) {
    StatementTree only = tree;
    if (tree instanceof BlockTree block && block.getStatements().size() == 1) {
      only = block.getStatements().get(0);
    }
    return only instanceof ContinueTree
        || only instanceof BreakTree
        || only instanceof ReturnTree
        || only instanceof ThrowTree;
  }

  private static boolean stable(ExpressionTree tree) {
    ExpressionTree current = tree;
    while (current instanceof MemberSelectTree select) {
      current = Support.unparenthesized(select.getExpression());
    }
    return current instanceof IdentifierTree || tree instanceof LiteralTree;
  }

  private String text(Tree tree) {
    return Support.source(tree, state);
  }
}
