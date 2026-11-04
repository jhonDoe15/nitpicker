package nitpicker.kotlinpsi.design.syntax;

import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

public final class Conditions {
  private Conditions() {}

  public static boolean decided(PsiElement read) {
    for (PsiElement p = read.getParent(); p != null; p = p.getParent()) {
      if (p instanceof KtBlockExpression || p instanceof KtFunctionLiteral || p instanceof KtDeclaration
          || p instanceof KtFile) {
        return false;
      }
      if (p instanceof KtIfExpression && PsiTreeUtil.isAncestor(((KtIfExpression) p).getCondition(), read, false)) {
        return true;
      }
      if (p instanceof KtWhileExpressionBase
          && PsiTreeUtil.isAncestor(((KtWhileExpressionBase) p).getCondition(), read, false)) {
        return true;
      }
      if (p instanceof KtWhenExpression
          && PsiTreeUtil.isAncestor(((KtWhenExpression) p).getSubjectExpression(), read, false)) {
        return true;
      }
      if (p instanceof KtWhenCondition) {
        return true;
      }
      if (logical(p)) {
        return true;
      }
    }
    return false;
  }

  private static boolean logical(PsiElement p) {
    if (!(p instanceof KtBinaryExpression)) {
      return false;
    }
    Object token = ((KtBinaryExpression) p).getOperationToken();
    return token == KtTokens.ANDAND || token == KtTokens.OROR;
  }
}
