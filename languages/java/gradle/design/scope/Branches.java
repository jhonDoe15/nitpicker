package nitpicker.designfacts.scope;

import com.sun.source.tree.*;
import com.sun.source.util.TreePath;
import com.sun.source.util.TreeScanner;
import java.util.*;

public final class Branches {
  private final Map<Tree, Integer> ordinals = new IdentityHashMap<>();
  private final Tree root;

  public Branches(Tree root) {
    this.root = root;
    new TreeScanner<Void, Void>() {
      @Override
      public Void scan(Tree tree, Void unused) {
        if (isConditional(tree)) {
          ordinals.put(tree, ordinals.size());
        }
        return super.scan(tree, unused);
      }
    }.scan(root, null);
  }

  private static boolean isConditional(Tree tree) {
    return tree instanceof IfTree
        || tree instanceof ConditionalExpressionTree
        || !arrowCases(tree).isEmpty();
  }

  private static List<? extends CaseTree> arrowCases(Tree tree) {
    List<? extends CaseTree> cases =
        switch (tree) {
          case SwitchTree statement -> statement.getCases();
          case SwitchExpressionTree expression -> expression.getCases();
          case null, default -> List.of();
        };
    boolean arrows = !cases.isEmpty() && cases.get(0).getCaseKind() == CaseTree.CaseKind.RULE;
    return arrows ? cases : List.of();
  }

  public List<String> of(TreePath path) {
    LinkedList<String> markers = new LinkedList<>();
    for (TreePath at = path; at != null && at.getLeaf() != root; at = at.getParentPath()) {
      TreePath parent = at.getParentPath();
      String arm = parent == null ? null : armOf(parent.getLeaf(), at.getLeaf());
      if (arm != null) {
        markers.addFirst(ordinals.get(parent.getLeaf()) + ":" + arm);
      }
    }
    return List.copyOf(markers);
  }

  private static String armOf(Tree conditional, Tree child) {
    return switch (conditional) {
      case IfTree branch when child == branch.getThenStatement() -> "then";
      case IfTree branch when child == branch.getElseStatement() -> "else";
      case ConditionalExpressionTree choice when child == choice.getTrueExpression() -> "then";
      case ConditionalExpressionTree choice when child == choice.getFalseExpression() -> "else";
      default -> caseArm(conditional, child);
    };
  }

  private static String caseArm(Tree conditional, Tree child) {
    int index = arrowCases(conditional).indexOf(child);
    return index < 0 ? null : String.valueOf(index);
  }
}
