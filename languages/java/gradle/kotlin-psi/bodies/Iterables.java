package nitpicker.kotlinpsi.bodies;

import static nitpicker.kotlinpsi.common.Psi.*;

import java.util.*;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

final class Iterables {
  private Iterables() {}

  static KtExpression sourceOf(PsiElement element) {
    if (element instanceof KtForExpression) {
      return ((KtForExpression) element).getLoopRange();
    }
    PsiElement parent = element.getParent();
    while (parent instanceof KtLabeledExpression || parent instanceof KtAnnotatedExpression) {
      parent = parent.getParent();
    }
    PsiElement call = parent instanceof KtLambdaArgument ? parent.getParent()
        : parent instanceof KtValueArgument ? parent.getParent().getParent() : null;
    if (call instanceof KtCallExpression && call.getParent() instanceof KtQualifiedExpression
        && ((KtQualifiedExpression) call.getParent()).getSelectorExpression() == call) {
      return ((KtQualifiedExpression) call.getParent()).getReceiverExpression();
    }
    return null;
  }

  static Map<String, Object> describe(KtExpression expression) {
    List<Object> links = new ArrayList<>();
    KtExpression current = bare(expression);
    while (current instanceof KtQualifiedExpression) {
      KtQualifiedExpression qualified = (KtQualifiedExpression) current;
      links.add(0, link(qualified.getSelectorExpression()));
      current = bare(qualified.getReceiverExpression());
    }
    if (current instanceof KtCallExpression) {
      links.add(0, link(current));
      return m("links", links);
    }
    Map<String, Object> data = m("root", clip(current), "links", links);
    if (current instanceof KtBinaryExpression) {
      KtBinaryExpression range = (KtBinaryExpression) current;
      data.put("range", m("operator", range.getOperationReference().getText(),
          "from", clip(range.getLeft()), "to", clip(range.getRight())));
    }
    return data;
  }

  private static KtExpression bare(KtExpression expression) {
    KtExpression current = expression;
    while (current instanceof KtParenthesizedExpression) {
      current = ((KtParenthesizedExpression) current).getExpression();
    }
    return current;
  }

  private static Map<String, Object> link(KtExpression selector) {
    if (!(selector instanceof KtCallExpression)) {
      return m("name", nameOf(selector));
    }
    KtCallExpression call = (KtCallExpression) selector;
    List<Object> values = new ArrayList<>();
    for (ValueArgument argument : call.getValueArguments()) {
      KtExpression value = argument.getArgumentExpression();
      if (!(argument instanceof KtLambdaArgument) && value != null && !(value instanceof KtLambdaExpression)) {
        values.add(clip(value));
      }
    }
    return m("name", nameOf(call.getCalleeExpression()), "arguments", values);
  }
}
