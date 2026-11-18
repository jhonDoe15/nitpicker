package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.MethodInvocationTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.fixes.SuggestedFixes;
import com.google.errorprone.matchers.Description;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.NewClassTree;
import com.sun.tools.javac.code.Symbol;
import java.util.Set;

@BugPattern(
    name = "DMI_RANDOM_USED_ONLY_ONCE",
    summary = "Draws one value from a new unseeded Random; ThreadLocalRandom gives the same without allocating one.",
    severity = WARNING)
public final class DmiRandomUsedOnlyOnce extends BugChecker implements MethodInvocationTreeMatcher {
  private static final Set<String> DRAWS =
      Set.of("nextInt", "nextLong", "nextDouble", "nextFloat", "nextBoolean", "nextGaussian", "nextBytes");

  @Override
  public Description matchMethodInvocation(MethodInvocationTree tree, VisitorState state) {
    if (!(tree.getMethodSelect() instanceof MemberSelectTree select)
        || !DRAWS.contains(select.getIdentifier().toString())
        || !(Support.unparenthesized(select.getExpression()) instanceof NewClassTree created)
        || !created.getArguments().isEmpty()
        || created.getClassBody() != null
        || created.getEnclosingExpression() != null
        || !isPlainRandom(created)) {
      return Description.NO_MATCH;
    }
    ExpressionTree receiver = select.getExpression();
    SuggestedFix.Builder fix = SuggestedFix.builder();
    String type = SuggestedFixes.qualifyType(state, fix, "java.util.concurrent.ThreadLocalRandom");
    fix.replace(receiver, type + ".current()");
    Support.dropImportIfUnused(fix, state, "Random", range(receiver, state), path ->
        path.getLeaf() instanceof MethodInvocationTree other
            && matchMethodInvocation(other, state.withPath(path)) != Description.NO_MATCH
            ? range(((MemberSelectTree) other.getMethodSelect()).getExpression(), state) : null);
    return describeMatch(tree, fix.build());
  }

  private static int[] range(ExpressionTree tree, VisitorState state) {
    return new int[] {Support.start(tree), Support.end(tree, state)};
  }

  private static boolean isPlainRandom(NewClassTree created) {
    Symbol type = ASTHelpers.getSymbol(created.getIdentifier());
    return type != null && type.getQualifiedName().contentEquals("java.util.Random");
  }
}
