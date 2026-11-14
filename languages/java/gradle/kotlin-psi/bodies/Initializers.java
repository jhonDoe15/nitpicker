package nitpicker.kotlinpsi.bodies;

import static nitpicker.kotlinpsi.common.Psi.clip;
import static nitpicker.kotlinpsi.common.Psi.m;
import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.List;
import java.util.Map;
import org.jetbrains.kotlin.lexer.KtTokens;
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

  public static KtExpression valueOf(KtProperty property) {
    KtExpression delegate = property.getDelegateExpression();
    if (delegate instanceof KtCallExpression lazy && "lazy".equals(nameOf(lazy.getCalleeExpression()))
        && !lazy.getLambdaArguments().isEmpty()) {
      KtLambdaExpression lambda = lazy.getLambdaArguments().get(0).getLambdaExpression();
      List<KtExpression> statements = lambda == null || lambda.getBodyExpression() == null ? List.of()
          : lambda.getBodyExpression().getStatements();
      return statements.isEmpty() ? null : statements.get(statements.size() - 1);
    }
    return property.getInitializer();
  }

  public static Map<String, Object> origin(KtExpression value) {
    KtExpression top = unwrap(value);
    String call = null;
    if (top instanceof KtQualifiedExpression && ((KtQualifiedExpression) top).getSelectorExpression()
        instanceof KtCallExpression) {
      call = nameOf(((KtCallExpression) ((KtQualifiedExpression) top).getSelectorExpression()).getCalleeExpression());
    } else if (top instanceof KtCallExpression) {
      call = nameOf(((KtCallExpression) top).getCalleeExpression());
    }
    KtExpression left = top;
    KtExpression selected = null;
    while (left instanceof KtQualifiedExpression) {
      selected = ((KtQualifiedExpression) left).getSelectorExpression();
      left = unwrap(((KtQualifiedExpression) left).getReceiverExpression());
    }
    String root = left instanceof KtCallExpression ? nameOf(((KtCallExpression) left).getCalleeExpression())
        : left instanceof KtThisExpression ? nameOf(selected) : nameOf(left);
    return root == null ? null : m("root", root, "call", call);
  }

  private static KtExpression unwrap(KtExpression value) {
    KtExpression current = value;
    while (true) {
      if (current instanceof KtParenthesizedExpression) {
        current = ((KtParenthesizedExpression) current).getExpression();
      } else if (current instanceof KtPostfixExpression) {
        current = ((KtPostfixExpression) current).getBaseExpression();
      } else if (current instanceof KtBinaryExpressionWithTypeRHS) {
        current = ((KtBinaryExpressionWithTypeRHS) current).getLeft();
      } else if (current instanceof KtBinaryExpression
          && ((KtBinaryExpression) current).getOperationToken() == KtTokens.ELVIS) {
        current = ((KtBinaryExpression) current).getLeft();
      } else {
        return current;
      }
    }
  }
}
