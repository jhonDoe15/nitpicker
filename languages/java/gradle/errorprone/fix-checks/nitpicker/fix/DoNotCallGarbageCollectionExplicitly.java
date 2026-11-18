package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.ExpressionStatementTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.matchers.Description;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.BlockTree;
import com.sun.source.tree.CaseTree;
import com.sun.source.tree.ExpressionStatementTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.LambdaExpressionTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.MethodTree;
import com.sun.source.tree.Tree;
import com.sun.source.util.TreePath;
import com.sun.tools.javac.code.Symbol;

@BugPattern(
    summary = "Calls the garbage collector explicitly; the JVM decides when to collect.",
    severity = WARNING)
public final class DoNotCallGarbageCollectionExplicitly extends BugChecker
    implements ExpressionStatementTreeMatcher {
  @Override
  public Description matchExpressionStatement(ExpressionStatementTree tree, VisitorState state) {
    if (!isCollectorCall(tree.getExpression()) || !isRemovable(state.getPath())) {
      return Description.NO_MATCH;
    }
    int[] range = lineRange(tree, state);
    return describeMatch(tree, SuggestedFix.replace(range[0], range[1], ""));
  }

  private static boolean isCollectorCall(ExpressionTree expression) {
    if (!(expression instanceof MethodInvocationTree call)
        || !call.getArguments().isEmpty()
        || !(call.getMethodSelect() instanceof MemberSelectTree select)
        || !select.getIdentifier().contentEquals("gc")) {
      return false;
    }
    Symbol method = ASTHelpers.getSymbol(call);
    if (method == null) {
      return false;
    }
    String owner = method.owner.getQualifiedName().toString();
    return method.isStatic()
        ? owner.equals("java.lang.System")
        : owner.equals("java.lang.Runtime") && isRuntimeLookup(select.getExpression());
  }

  private static boolean isRuntimeLookup(ExpressionTree receiver) {
    if (!(Support.unparenthesized(receiver) instanceof MethodInvocationTree lookup)
        || !lookup.getArguments().isEmpty()) {
      return false;
    }
    Symbol method = ASTHelpers.getSymbol(lookup);
    return method != null
        && method.isStatic()
        && method.name.contentEquals("getRuntime")
        && method.owner.getQualifiedName().contentEquals("java.lang.Runtime");
  }

  private static boolean isRemovable(TreePath statement) {
    Tree parent = statement.getParentPath().getLeaf();
    if (parent instanceof CaseTree branch) {
      return branch.getCaseKind() == CaseTree.CaseKind.STATEMENT;
    }
    if (!(parent instanceof BlockTree block)) {
      return false;
    }
    boolean otherwise = block.getStatements().stream().anyMatch(other -> !isGcStatement(other));
    Tree owner = statement.getParentPath().getParentPath().getLeaf();
    return otherwise || owner instanceof MethodTree || owner instanceof LambdaExpressionTree;
  }

  private static boolean isGcStatement(Tree statement) {
    return statement instanceof ExpressionStatementTree expression && isCollectorCall(expression.getExpression());
  }

  private static int[] lineRange(ExpressionStatementTree tree, VisitorState state) {
    CharSequence text = state.getSourceCode();
    int start = Support.start(tree);
    int end = Support.end(tree, state);
    int after = end;
    while (after < text.length() && (text.charAt(after) == ' ' || text.charAt(after) == '\t')) {
      after++;
    }
    boolean lineEnds = after >= text.length() || text.charAt(after) == '\n' || text.charAt(after) == '\r';
    boolean trailingComment = text.toString().startsWith("//", after);
    if (Support.startsLine(start, state) && (lineEnds || trailingComment)) {
      int lineStart = start;
      while (lineStart > 0 && text.charAt(lineStart - 1) != '\n') {
        lineStart--;
      }
      int lineEnd = after;
      while (lineEnd < text.length() && text.charAt(lineEnd) != '\n') {
        lineEnd++;
      }
      return new int[] {lineStart, Math.min(lineEnd + 1, text.length())};
    }
    int before = start;
    while (before > 0 && (text.charAt(before - 1) == ' ' || text.charAt(before - 1) == '\t')) {
      before--;
    }
    return new int[] {before, end};
  }
}
