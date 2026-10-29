package nitpicker.kotlinpsi.bodies;

import static nitpicker.kotlinpsi.common.Psi.clip;
import static nitpicker.kotlinpsi.common.Psi.nameOf;

import org.jetbrains.kotlin.psi.*;

public final class Initializers {
  private Initializers() {}

  public static String callee(KtProperty property) {
    return callee(property.getInitializer());
  }

  static String callee(KtExpression initializer) {
    KtExpression value = initializer;
    if (value instanceof KtQualifiedExpression) {
      value = ((KtQualifiedExpression) value).getSelectorExpression();
    }
    return value instanceof KtCallExpression ? nameOf(((KtCallExpression) value).getCalleeExpression()) : null;
  }

  public static KtExpression lazyValue(KtProperty property) {
    KtExpression delegate = property.getDelegateExpression();
    if (!(delegate instanceof KtCallExpression)
        || !"lazy".equals(nameOf(((KtCallExpression) delegate).getCalleeExpression()))) {
      return null;
    }
    for (KtLambdaArgument argument : ((KtCallExpression) delegate).getLambdaArguments()) {
      KtLambdaExpression lambda = argument.getLambdaExpression();
      KtBlockExpression body = lambda == null ? null : lambda.getBodyExpression();
      if (body != null && !body.getStatements().isEmpty()) {
        return body.getStatements().get(body.getStatements().size() - 1);
      }
    }
    return null;
  }

  static String alias(KtProperty property) {
    KtExpression value = property.getInitializer();
    while (value instanceof KtDotQualifiedExpression
        && ((KtDotQualifiedExpression) value).getSelectorExpression() instanceof KtNameReferenceExpression) {
      value = ((KtDotQualifiedExpression) value).getReceiverExpression();
    }
    return value instanceof KtNameReferenceExpression || value instanceof KtThisExpression
        ? clip(property.getInitializer()) : null;
  }

  public static Boolean literal(KtProperty property) {
    return isLiteral(property.getInitializer()) ? Boolean.TRUE : null;
  }

  static boolean isLiteral(KtExpression value) {
    return value instanceof KtStringTemplateExpression && !((KtStringTemplateExpression) value).hasInterpolation();
  }
}
