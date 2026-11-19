package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.IfTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.matchers.Description;
import com.sun.source.tree.BlockTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.IfTree;
import com.sun.source.tree.ParenthesizedTree;
import com.sun.source.tree.StatementTree;

@BugPattern(
    summary = "Joins an if statement that only holds another if statement with &&.",
    severity = WARNING)
public final class CollapsibleIfStatements extends BugChecker implements IfTreeMatcher {
  @Override
  public Description matchIf(IfTree outer, VisitorState state) {
    IfTree inner = innerIf(outer);
    if (inner == null || outer.getElseStatement() != null || inner.getElseStatement() != null) {
      return Description.NO_MATCH;
    }
    ExpressionTree first = ((ParenthesizedTree) outer.getCondition()).getExpression();
    ExpressionTree second = ((ParenthesizedTree) inner.getCondition()).getExpression();
    StatementTree body = inner.getThenStatement();
    if (hasComment(outer, inner, first, second, state) || Support.source(body, state).contains("\"\"\"")) {
      return Description.NO_MATCH;
    }
    String condition =
        Precedence.wrap(first, Precedence.AND, state) + " && " + Precedence.wrap(second, Precedence.AND, state);
    String text = "if (" + condition + ") " + shifted(Support.source(body, state), outer, inner, state);
    return describeMatch(outer, SuggestedFix.replace(outer, text));
  }

  private static IfTree innerIf(IfTree outer) {
    StatementTree then = outer.getThenStatement();
    if (then instanceof BlockTree block) {
      then = block.getStatements().size() == 1 ? block.getStatements().get(0) : null;
    }
    return then instanceof IfTree inner ? inner : null;
  }

  private static boolean hasComment(
      IfTree outer, IfTree inner, ExpressionTree first, ExpressionTree second, VisitorState state) {
    CharSequence text = state.getSourceCode();
    String[] gaps = {
      text.subSequence(Support.start(outer), Support.start(first)).toString(),
      text.subSequence(Support.end(first, state), Support.start(second)).toString(),
      text.subSequence(Support.end(second, state), Support.start(inner.getThenStatement())).toString(),
      text.subSequence(Support.end(inner, state), Support.end(outer, state)).toString(),
    };
    for (String gap : gaps) {
      if (gap.contains("/")) {
        return true;
      }
    }
    return false;
  }

  private static String shifted(String body, IfTree outer, IfTree inner, VisitorState state) {
    String outerIndent = Support.indentAt(Support.start(outer), state);
    String innerIndent = Support.indentAt(Support.start(inner), state);
    if (!Support.startsLine(Support.start(inner), state)
        || innerIndent.length() <= outerIndent.length()
        || !innerIndent.startsWith(outerIndent)) {
      return body;
    }
    StringBuilder shifted = new StringBuilder();
    String[] lines = body.split("\n", -1);
    for (int index = 0; index < lines.length; index++) {
      String line = lines[index];
      boolean indented = index > 0 && line.startsWith(innerIndent);
      shifted.append(indented ? outerIndent + line.substring(innerIndent.length()) : line);
      shifted.append(index < lines.length - 1 ? "\n" : "");
    }
    return shifted.toString();
  }
}
