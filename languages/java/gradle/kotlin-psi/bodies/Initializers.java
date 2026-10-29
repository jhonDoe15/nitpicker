package nitpicker.kotlinpsi.bodies;

import static nitpicker.kotlinpsi.common.Psi.clip;
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

  public static String argument(KtProperty property) {
    KtExpression value = property.getInitializer();
    if (value instanceof KtQualifiedExpression) {
      value = ((KtQualifiedExpression) value).getSelectorExpression();
    }
    if (!(value instanceof KtCallExpression) || ((KtCallExpression) value).getValueArguments().size() != 1) {
      return null;
    }
    return clip(((KtCallExpression) value).getValueArguments().get(0).getArgumentExpression());
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
