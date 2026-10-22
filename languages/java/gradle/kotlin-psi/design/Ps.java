package nitpicker.kotlinpsi.design;

import java.util.Set;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

final class Ps {
  private static final Set<Object> ASSIGNMENTS =
      Set.of(KtTokens.EQ, KtTokens.PLUSEQ, KtTokens.MINUSEQ, KtTokens.MULTEQ, KtTokens.DIVEQ, KtTokens.PERCEQ);

  private Ps() {}

  static KtExpression parens(KtExpression expression) {
    KtExpression current = expression;
    while (current != null) {
      if (current instanceof KtParenthesizedExpression) {
        current = ((KtParenthesizedExpression) current).getExpression();
      } else if (current instanceof KtAnnotatedExpression) {
        current = ((KtAnnotatedExpression) current).getBaseExpression();
      } else if (current instanceof KtLabeledExpression) {
        current = ((KtLabeledExpression) current).getBaseExpression();
      } else {
        return current;
      }
    }
    return null;
  }

  static KtExpression strip(KtExpression expression) {
    KtExpression current = parens(expression);
    while (current != null) {
      if (current instanceof KtPostfixExpression
          && ((KtPostfixExpression) current).getOperationToken() == KtTokens.EXCLEXCL) {
        current = parens(((KtPostfixExpression) current).getBaseExpression());
      } else if (current instanceof KtBinaryExpressionWithTypeRHS) {
        current = parens(((KtBinaryExpressionWithTypeRHS) current).getLeft());
      } else {
        return current;
      }
    }
    return null;
  }

  static String name(KtCallExpression call) {
    KtExpression callee = call.getCalleeExpression();
    return callee instanceof KtSimpleNameExpression ? ((KtSimpleNameExpression) callee).getReferencedName() : null;
  }

  static boolean assignment(KtBinaryExpression expression) {
    return ASSIGNMENTS.contains(expression.getOperationToken());
  }

  static boolean isPrivate(KtModifierListOwner owner) {
    return owner.hasModifier(KtTokens.PRIVATE_KEYWORD);
  }

  static String compact(String text) {
    return text == null ? null : text.replaceAll("\\s+", "");
  }

  static String eraseGenerics(String text) {
    StringBuilder out = new StringBuilder();
    int depth = 0;
    for (int i = 0; i < text.length(); i++) {
      char c = text.charAt(i);
      if (c == '<') {
        depth++;
      } else if (c == '>' && depth > 0 && !(i > 0 && text.charAt(i - 1) == '-')) {
        depth--;
      } else if (depth == 0) {
        out.append(c);
      }
    }
    return out.toString();
  }

  static String typeText(KtTypeReference reference) {
    return reference == null ? null : eraseGenerics(compact(reference.getText()));
  }

  static boolean contains(PsiElement outer, PsiElement inner) {
    return outer != null && inner != null && outer.getTextRange().contains(inner.getTextRange())
        && outer.getContainingFile() == inner.getContainingFile();
  }

  static KtExpression selectorCall(KtCallExpression call) {
    PsiElement parent = call.getParent();
    return parent instanceof KtQualifiedExpression && ((KtQualifiedExpression) parent).getSelectorExpression() == call
        ? (KtExpression) parent
        : call;
  }

  static KtExpression receiverOf(KtCallExpression call) {
    PsiElement parent = call.getParent();
    return parent instanceof KtQualifiedExpression && ((KtQualifiedExpression) parent).getSelectorExpression() == call
        ? ((KtQualifiedExpression) parent).getReceiverExpression()
        : null;
  }
}
