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
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.Tree;

@BugPattern(
    summary = "Calls isEmpty() on a collection or map instead of comparing its size with zero.",
    severity = WARNING)
public final class UseCollectionIsEmpty extends BugChecker implements BinaryTreeMatcher {
  @Override
  public Description matchBinary(BinaryTree tree, VisitorState state) {
    MethodInvocationTree size = sizeCall(tree.getLeftOperand(), state);
    Integer constant = Support.integer(tree.getRightOperand());
    Tree.Kind kind = tree.getKind();
    if (size == null || constant == null) {
      size = sizeCall(tree.getRightOperand(), state);
      constant = Support.integer(tree.getLeftOperand());
      kind = Support.mirrored(kind);
    }
    if (size == null || constant == null || kind == null) {
      return Description.NO_MATCH;
    }
    Boolean empty = Support.emptiness(kind, constant);
    if (empty == null) {
      return Description.NO_MATCH;
    }
    MemberSelectTree select = (MemberSelectTree) size.getMethodSelect();
    String receiver = Support.source(select.getExpression(), state);
    return describeMatch(tree, SuggestedFix.replace(tree, (empty ? "" : "!") + receiver + ".isEmpty()"));
  }

  private static MethodInvocationTree sizeCall(ExpressionTree tree, VisitorState state) {
    if (!(Support.unparenthesized(tree) instanceof MethodInvocationTree call)
        || !call.getArguments().isEmpty()
        || !(call.getMethodSelect() instanceof MemberSelectTree select)
        || !select.getIdentifier().contentEquals("size")) {
      return null;
    }
    com.sun.tools.javac.code.Type type = ASTHelpers.getType(select.getExpression());
    boolean known = type != null
        && (ASTHelpers.isSubtype(type, state.getTypeFromString("java.util.Collection"), state)
            || ASTHelpers.isSubtype(type, state.getTypeFromString("java.util.Map"), state));
    return known ? call : null;
  }
}
