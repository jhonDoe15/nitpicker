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

  public static String qualifier(KtExpression initializer) {
    return initializer instanceof KtDotQualifiedExpression
        && ((KtDotQualifiedExpression) initializer).getSelectorExpression() instanceof KtNameReferenceExpression
        ? clip(((KtDotQualifiedExpression) initializer).getReceiverExpression()) : null;
  }

  public static String typeArguments(KtExpression initializer) {
    KtExpression value = initializer instanceof KtQualifiedExpression
        ? ((KtQualifiedExpression) initializer).getSelectorExpression() : initializer;
    return value instanceof KtCallExpression ? clip(((KtCallExpression) value).getTypeArgumentList()) : null;
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

  public static String literalText(KtProperty property) {
    return isLiteral(property.getInitializer()) ? clip(property.getInitializer()) : null;
  }

  static boolean isLiteral(KtExpression value) {
    return value instanceof KtStringTemplateExpression && !((KtStringTemplateExpression) value).hasInterpolation();
  }
}
