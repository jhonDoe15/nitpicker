package nitpicker.kotlinpsi.facts;

import static nitpicker.kotlinpsi.common.Psi.*;

import java.util.*;
import java.util.regex.Pattern;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

final class Scopes {
  private static final Pattern CLOCK = Pattern.compile(
      "nanoTime|currentTimeMillis|Instant\\.now|markNow|elapsedNow|TimeSource|Clock\\b|measureTime");
  private static final Pattern RANGE =
      Pattern.compile("\\.\\.|\\buntil\\b|\\bdownTo\\b|\\bstep\\b|\\.indices\\b");

  private Scopes() {}

  static Map<String, Object> lambdaData(KtLambdaExpression lambda) {
    PsiElement parent = lambda.getParent();
    while (parent instanceof KtLabeledExpression || parent instanceof KtAnnotatedExpression
        || parent instanceof KtParenthesizedExpression) {
      parent = parent.getParent();
    }
    String host = null;
    String qualifier = null;
    PsiElement call = parent instanceof KtLambdaArgument ? parent.getParent()
        : parent instanceof KtValueArgument ? parent.getParent().getParent() : null;
    if (call instanceof KtCallExpression) {
      host = nameOf(((KtCallExpression) call).getCalleeExpression());
      PsiElement outer = call.getParent();
      if (outer instanceof KtQualifiedExpression
          && ((KtQualifiedExpression) outer).getSelectorExpression() == call) {
        qualifier = clip(((KtQualifiedExpression) outer).getReceiverExpression());
      }
    } else if (parent instanceof KtBinaryExpression
        && ((KtBinaryExpression) parent).getOperationToken() == KtTokens.IDENTIFIER) {
      host = ((KtBinaryExpression) parent).getOperationReference().getReferencedName();
    }
    return m("k", "lambda", "host", host, "qualifier", qualifier);
  }

  static Map<String, Object> loopData(KtLoopExpression loop) {
    String condition = null;
    if (loop instanceof KtWhileExpression && ((KtWhileExpression) loop).getCondition() != null) {
      condition = clip(((KtWhileExpression) loop).getCondition());
    } else if (loop instanceof KtDoWhileExpression && ((KtDoWhileExpression) loop).getCondition() != null) {
      condition = clip(((KtDoWhileExpression) loop).getCondition());
    } else if (loop instanceof KtForExpression) {
      condition = "for";
    }
    boolean counted = !"for".equals(condition) || isCounted(loop);
    return m(
        "k", counted ? "loop" : "foreach", "condition", condition,
        "clock", CLOCK.matcher(loop.getText()).find());
  }

  private static boolean isCounted(KtLoopExpression loop) {
    return loop instanceof KtForExpression && ((KtForExpression) loop).getLoopRange() != null
        && RANGE.matcher(((KtForExpression) loop).getLoopRange().getText()).find();
  }
}
