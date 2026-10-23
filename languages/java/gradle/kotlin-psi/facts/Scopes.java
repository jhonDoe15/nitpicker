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

  private static List<Object> parameters(List<? extends KtParameter> declared) {
    List<Object> parameters = new ArrayList<>();
    for (KtParameter parameter : declared) {
      KtDestructuringDeclaration destructuring = parameter.getDestructuringDeclaration();
      if (destructuring == null) {
        parameters.add(m("name", parameter.getName(), "type", clip(parameter.getTypeReference())));
        continue;
      }
      List<KtDestructuringDeclarationEntry> entries = destructuring.getEntries();
      for (int index = 0; index < entries.size(); index++) {
        parameters.add(m("name", entries.get(index).getName(), "type", clip(entries.get(index).getTypeReference()),
            "component", index + 1));
      }
    }
    return parameters.isEmpty() ? null : parameters;
  }

  static Map<String, Object> lambdaData(KtLambdaExpression lambda, State state) {
    PsiElement parent = lambda.getParent();
    while (parent instanceof KtLabeledExpression || parent instanceof KtAnnotatedExpression
        || parent instanceof KtParenthesizedExpression) {
      parent = parent.getParent();
    }
    String host = null;
    String qualifier = null;
    String argument = null;
    PsiElement call = parent instanceof KtLambdaArgument ? parent.getParent()
        : parent instanceof KtValueArgument ? parent.getParent().getParent() : null;
    if (call instanceof KtCallExpression) {
      host = nameOf(((KtCallExpression) call).getCalleeExpression());
      List<? extends ValueArgument> values = ((KtCallExpression) call).getValueArguments();
      if (!values.isEmpty() && !(values.get(0) instanceof KtLambdaArgument)
          && !(values.get(0).getArgumentExpression() instanceof KtLambdaExpression)) {
        argument = clip(values.get(0).getArgumentExpression());
      }
      PsiElement outer = call.getParent();
      if (outer instanceof KtQualifiedExpression
          && ((KtQualifiedExpression) outer).getSelectorExpression() == call) {
        qualifier = clip(((KtQualifiedExpression) outer).getReceiverExpression());
      }
    } else if (parent instanceof KtBinaryExpression
        && ((KtBinaryExpression) parent).getOperationToken() == KtTokens.IDENTIFIER) {
      host = ((KtBinaryExpression) parent).getOperationReference().getReferencedName();
    }
    return m("k", "lambda", "host", host, "qualifier", qualifier, "argument", argument,
        "line", state.lineOf(lambda.getTextOffset()), "params", parameters(lambda.getValueParameters()));
  }

  static Map<String, Object> loopData(KtLoopExpression loop, State state) {
    String condition = null;
    if (loop instanceof KtWhileExpression && ((KtWhileExpression) loop).getCondition() != null) {
      condition = clip(((KtWhileExpression) loop).getCondition());
    } else if (loop instanceof KtDoWhileExpression && ((KtDoWhileExpression) loop).getCondition() != null) {
      condition = clip(((KtDoWhileExpression) loop).getCondition());
    } else if (loop instanceof KtForExpression) {
      condition = "for";
    }
    boolean counted = !"for".equals(condition) || isCounted(loop);
    Map<String, Object> data = m(
        "k", counted ? "loop" : "foreach", "condition", condition,
        "clock", CLOCK.matcher(loop.getText()).find());
    if (loop instanceof KtForExpression && ((KtForExpression) loop).getLoopParameter() != null) {
      KtForExpression each = (KtForExpression) loop;
      data.put("params", parameters(List.of(each.getLoopParameter())));
      data.put("range", clip(each.getLoopRange()));
    }
    return data;
  }

  private static boolean isCounted(KtLoopExpression loop) {
    return loop instanceof KtForExpression && ((KtForExpression) loop).getLoopRange() != null
        && RANGE.matcher(((KtForExpression) loop).getLoopRange().getText()).find();
  }
}
