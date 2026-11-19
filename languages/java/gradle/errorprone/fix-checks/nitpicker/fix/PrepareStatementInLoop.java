package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.EnhancedForLoopTreeMatcher;
import com.google.errorprone.bugpatterns.BugChecker.ForLoopTreeMatcher;
import com.google.errorprone.bugpatterns.BugChecker.WhileLoopTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.matchers.Description;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.BlockTree;
import com.sun.source.tree.EnhancedForLoopTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.ForLoopTree;
import com.sun.source.tree.LabeledStatementTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.StatementTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.TryTree;
import com.sun.source.tree.VariableTree;
import com.sun.source.tree.WhileLoopTree;
import com.sun.tools.javac.code.Symbol;
import com.sun.tools.javac.code.Type;

@BugPattern(
    name = "IIL_PREPARE_STATEMENT_IN_LOOP",
    summary = "Prepares the statement once, around the loop, instead of on every pass.",
    severity = WARNING)
public final class PrepareStatementInLoop extends BugChecker
    implements ForLoopTreeMatcher, EnhancedForLoopTreeMatcher, WhileLoopTreeMatcher {

  @Override
  public Description matchForLoop(ForLoopTree tree, VisitorState state) {
    return check(tree, tree.getStatement(), state);
  }

  @Override
  public Description matchEnhancedForLoop(EnhancedForLoopTree tree, VisitorState state) {
    return check(tree, tree.getStatement(), state);
  }

  @Override
  public Description matchWhileLoop(WhileLoopTree tree, VisitorState state) {
    return check(tree, tree.getStatement(), state);
  }

  private Description check(StatementTree loop, StatementTree body, VisitorState state) {
    if (state.getPath().getParentPath().getLeaf() instanceof LabeledStatementTree
        || !Support.startsLine(Support.start(loop), state)) {
      return Description.NO_MATCH;
    }
    TryTree tryTree = onlyTry(body);
    if (tryTree == null
        || !tryTree.getCatches().isEmpty()
        || tryTree.getFinallyBlock() != null
        || tryTree.getResources().size() != 1
        || !(tryTree.getResources().get(0) instanceof VariableTree resource)
        || resource.getInitializer() == null) {
      return Description.NO_MATCH;
    }
    if (!PreparedStatementUse.reusable(loop, tryTree, resource, state)) {
      return Description.NO_MATCH;
    }
    BlockTree block = tryTree.getBlock();
    CharSequence text = state.getSourceCode();
    String indent = Support.indentAt(Support.start(loop), state);
    String header = text.subSequence(Support.start(loop), Support.start(body)).toString();
    String inner = text.subSequence(Support.start(block) + 1, Support.end(block, state) - 1).toString().stripTrailing();
    String replacement =
        "try (" + Support.source(resource, state) + ") {\n" + indent + "  " + header + "{" + inner + "\n" + indent
            + "  }\n" + indent + "}";
    return describeMatch(loop, SuggestedFix.replace(loop, replacement));
  }

  private static TryTree onlyTry(StatementTree body) {
    if (body instanceof TryTree direct) {
      return direct;
    }
    if (body instanceof BlockTree block
        && block.getStatements().size() == 1
        && block.getStatements().get(0) instanceof TryTree only) {
      return only;
    }
    return null;
  }
}
