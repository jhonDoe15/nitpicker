package nitpicker.kotlinpsi.facts.lifetimes;

import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.*;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

final class Hosts {
  private Hosts() {}

  static KtCallExpression of(KtLambdaExpression lambda) {
    PsiElement parent = lambda.getParent();
    while (parent instanceof KtLabeledExpression
        || parent instanceof KtAnnotatedExpression
        || parent instanceof KtParenthesizedExpression) {
      parent = parent.getParent();
    }
    PsiElement call =
        parent instanceof KtLambdaArgument
            ? parent.getParent()
            : parent instanceof KtValueArgument && parent.getParent() != null
                ? parent.getParent().getParent()
                : null;
    return call instanceof KtCallExpression ? (KtCallExpression) call : null;
  }

  static String nameOfHost(KtLambdaExpression lambda) {
    KtCallExpression call = of(lambda);
    return call == null ? null : nameOf(call.getCalleeExpression());
  }

  static List<KtLambdaExpression> lambdas(KtCallExpression call) {
    List<KtLambdaExpression> lambdas = new ArrayList<>();
    for (ValueArgument argument : call.getValueArguments()) {
      KtExpression expression = unwrap(argument.getArgumentExpression());
      if (expression instanceof KtLambdaExpression) {
        lambdas.add((KtLambdaExpression) expression);
      }
    }
    return lambdas;
  }

  static KtExpression unwrap(KtExpression expression) {
    KtExpression current = expression;
    while (current instanceof KtLabeledExpression || current instanceof KtParenthesizedExpression
        || current instanceof KtAnnotatedExpression) {
      current = current instanceof KtLabeledExpression
          ? ((KtLabeledExpression) current).getBaseExpression()
          : current instanceof KtParenthesizedExpression
              ? ((KtParenthesizedExpression) current).getExpression()
              : ((KtAnnotatedExpression) current).getBaseExpression();
    }
    return current;
  }

  static KtExpression receiverOf(KtCallExpression call) {
    PsiElement parent = call.getParent();
    return parent instanceof KtQualifiedExpression
            && ((KtQualifiedExpression) parent).getSelectorExpression() == call
        ? ((KtQualifiedExpression) parent).getReceiverExpression()
        : null;
  }

  static Set<String> names(String... names) {
    return new HashSet<>(Arrays.asList(names));
  }

  static KtClassOrObject classOf(PsiElement element) {
    PsiElement current = element.getParent();
    while (current != null && !(current instanceof KtClassOrObject)) {
      current = current.getParent();
    }
    return (KtClassOrObject) current;
  }

  static boolean isBoundary(PsiElement element) {
    return element instanceof KtNamedFunction
        || element instanceof KtClassOrObject
        || element instanceof KtFile
        || element instanceof KtPropertyAccessor
        || element instanceof KtSecondaryConstructor;
  }

  static boolean mentions(PsiElement element, Set<String> names) {
    if (element instanceof KtNameReferenceExpression
        && names.contains(((KtNameReferenceExpression) element).getReferencedName())) {
      return true;
    }
    for (PsiElement child : element.getChildren()) {
      if (mentions(child, names)) {
        return true;
      }
    }
    return false;
  }
}
