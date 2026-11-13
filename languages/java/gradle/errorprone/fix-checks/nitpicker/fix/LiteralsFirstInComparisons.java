package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.MethodInvocationTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.matchers.Description;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.LiteralTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.Tree;
import java.util.Set;

@BugPattern(
    summary = "Puts the string literal first: \"literal\".equals(value) does not throw on a null value.",
    severity = WARNING)
public final class LiteralsFirstInComparisons extends BugChecker implements MethodInvocationTreeMatcher {
  private static final Set<String> METHODS = Set.of("equals", "equalsIgnoreCase", "contentEquals");

  @Override
  public Description matchMethodInvocation(MethodInvocationTree tree, VisitorState state) {
    if (!(tree.getMethodSelect() instanceof MemberSelectTree select)
        || !METHODS.contains(select.getIdentifier().toString())
        || tree.getArguments().size() != 1) {
      return Description.NO_MATCH;
    }
    ExpressionTree receiver = select.getExpression();
    ExpressionTree argument = Support.unparenthesized(tree.getArguments().get(0));
    if (!isStringLiteral(argument)
        || isStringLiteral(Support.unparenthesized(receiver))
        || !ASTHelpers.isSameType(ASTHelpers.getType(receiver), state.getSymtab().stringType, state)
        || ASTHelpers.constValue(receiver) != null) {
      return Description.NO_MATCH;
    }
    String literal = Support.source(tree.getArguments().get(0), state);
    String text = Support.source(Support.unparenthesized(receiver), state);
    String call = select.getIdentifier().toString();
    return describeMatch(tree, SuggestedFix.replace(tree, literal + "." + call + "(" + text + ")"));
  }

  private static boolean isStringLiteral(Tree tree) {
    return tree instanceof LiteralTree literal && literal.getValue() instanceof String;
  }
}
