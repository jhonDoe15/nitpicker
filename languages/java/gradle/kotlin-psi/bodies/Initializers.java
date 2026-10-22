package nitpicker.kotlinpsi.bodies;

import static nitpicker.kotlinpsi.common.Psi.nameOf;

import org.jetbrains.kotlin.psi.*;

public final class Initializers {
  private Initializers() {}

  public static String callee(KtProperty property) {
    KtExpression value = property.getInitializer();
    if (value instanceof KtQualifiedExpression) {
      value = ((KtQualifiedExpression) value).getSelectorExpression();
    }
    return value instanceof KtCallExpression ? nameOf(((KtCallExpression) value).getCalleeExpression()) : null;
  }

  public static Boolean literal(KtProperty property) {
    return isLiteral(property.getInitializer()) ? Boolean.TRUE : null;
  }

  static boolean isLiteral(KtExpression value) {
    return value instanceof KtStringTemplateExpression && !((KtStringTemplateExpression) value).hasInterpolation();
  }
}
