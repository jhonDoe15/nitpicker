package nitpicker.kotlinpsi.bodies;

import static nitpicker.kotlinpsi.common.Psi.m;
import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.*;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.psi.*;

public final class Throwing {
  private static final Set<String> FAILING = Set.of("error", "TODO");

  private final Set<String> nothing;

  Throwing(Set<String> nothing) {
    this.nothing = nothing;
  }

  public static Set<String> nothingFunctions(List<KtFile> files) {
    Set<String> names = new HashSet<>();
    for (KtFile file : files) {
      for (KtNamedFunction function : PsiTreeUtil.collectElementsOfType(file, KtNamedFunction.class)) {
        KtTypeReference type = function.getTypeReference();
        if (type != null && "Nothing".equals(type.getText().trim()) && function.getName() != null) {
          names.add(function.getName());
        }
      }
    }
    return names;
  }

  boolean throwsIn(PsiElement body) {
    if (body == null) {
      return false;
    }
    if (PsiTreeUtil.findChildOfType(body, KtThrowExpression.class) != null || body instanceof KtThrowExpression) {
      return true;
    }
    for (KtCallExpression call : PsiTreeUtil.collectElementsOfType(body, KtCallExpression.class)) {
      String name = nameOf(call.getCalleeExpression());
      if (FAILING.contains(name) || nothing.contains(name)) {
        return true;
      }
    }
    return false;
  }

  boolean lambdaThrows(KtCallExpression call) {
    for (ValueArgument argument : call.getValueArguments()) {
      KtExpression expression = argument.getArgumentExpression();
      if (expression instanceof KtLambdaExpression && throwsIn(((KtLambdaExpression) expression).getBodyExpression())) {
        return true;
      }
    }
    return false;
  }

  static Map<String, Object> thrown(KtThrowExpression expression) {
    KtExpression value = expression.getThrownExpression();
    if (value instanceof KtQualifiedExpression) {
      value = ((KtQualifiedExpression) value).getSelectorExpression();
    }
    return value instanceof KtCallExpression
        ? m("type", nameOf(((KtCallExpression) value).getCalleeExpression()), "caught", caught(expression)) : null;
  }

  private static Boolean caught(PsiElement start) {
    PsiElement child = start;
    for (PsiElement up = start.getParent(); up != null && !(up instanceof KtDeclarationWithBody);
        up = up.getParent()) {
      if (up instanceof KtTryExpression && ((KtTryExpression) up).getTryBlock() == child
          && !((KtTryExpression) up).getCatchClauses().isEmpty()) {
        return Boolean.TRUE;
      }
      child = up;
    }
    return null;
  }
}
