package nitpicker.kotlinpsi.bodies;

import static nitpicker.kotlinpsi.common.Psi.*;

import java.util.*;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

final class NullTests {
  private static final Set<Object> EQUAL = Set.of(KtTokens.EQEQ, KtTokens.EQEQEQ);
  private static final Set<Object> UNEQUAL = Set.of(KtTokens.EXCLEQ, KtTokens.EXCLEQEQEQ);

  private final List<Object> tests = new ArrayList<>();

  void binary(KtBinaryExpression expression, int line, Integer scope) {
    Object token = expression.getOperationToken();
    KtExpression left = KtPsiUtil.safeDeparenthesize(expression.getLeft());
    KtExpression right = KtPsiUtil.safeDeparenthesize(expression.getRight());
    if (left == null || right == null) {
      return;
    }
    if (token == KtTokens.ELVIS) {
      KtExpression subject = left instanceof KtBinaryExpression
          && ((KtBinaryExpression) left).getOperationToken() == KtTokens.ELVIS
          ? KtPsiUtil.safeDeparenthesize(((KtBinaryExpression) left).getRight()) : left;
      tests.add(m("line", line, "scope", scope, "operator", "?:", "subject", clip(subject), "fallback", clip(right)));
    } else if (EQUAL.contains(token) || UNEQUAL.contains(token)) {
      KtExpression subject = isNull(right) ? left : isNull(left) ? right : null;
      if (subject != null) {
        tests.add(m("line", line, "scope", scope, "operator", EQUAL.contains(token) ? "==" : "!=",
            "subject", clip(subject), "condition", clip(conditionOf(expression))));
      }
    }
  }

  private static boolean isNull(KtExpression expression) {
    return expression instanceof KtConstantExpression && "null".equals(expression.getText());
  }

  private static PsiElement conditionOf(KtExpression expression) {
    PsiElement current = expression;
    PsiElement parent = current.getParent();
    while (parent instanceof KtParenthesizedExpression
        || (parent instanceof KtBinaryExpression
            && (((KtBinaryExpression) parent).getOperationToken() == KtTokens.ANDAND
                || ((KtBinaryExpression) parent).getOperationToken() == KtTokens.OROR))
        || (parent instanceof KtPrefixExpression
            && ((KtPrefixExpression) parent).getOperationToken() == KtTokens.EXCL)) {
      current = parent;
      parent = current.getParent();
    }
    return current;
  }

  List<Object> tests() {
    return tests;
  }
}
