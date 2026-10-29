package nitpicker.kotlinpsi.bodies;

import java.util.List;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

final class Positions {
  private Positions() {}

  static KtExpression settled(KtExpression outer) {
    KtExpression current = outer;
    while (true) {
      PsiElement parent = current.getParent();
      if (parent instanceof KtContainerNodeForControlStructureBody && parent.getParent() instanceof KtIfExpression) {
        current = (KtExpression) parent.getParent();
      } else if (parent instanceof KtWhenEntry && ((KtWhenEntry) parent).getExpression() == current) {
        current = (KtExpression) parent.getParent();
      } else if (jumpElvis(parent, current) || labeledReturn(parent, current)) {
        current = (KtExpression) parent;
      } else {
        return current;
      }
    }
  }

  static boolean statementPosition(KtExpression expression) {
    PsiElement parent = expression.getParent();
    return parent instanceof KtBlockExpression
        || parent instanceof KtContainerNodeForControlStructureBody && parent.getParent() instanceof KtLoopExpression;
  }

  static boolean lambdaResult(KtExpression expression) {
    if (expression instanceof KtReturnExpression && ((KtReturnExpression) expression).getLabelName() != null) {
      return true;
    }
    PsiElement parent = expression.getParent();
    if (!(parent instanceof KtBlockExpression) || !(parent.getParent() instanceof KtFunctionLiteral)) {
      return false;
    }
    List<KtExpression> statements = ((KtBlockExpression) parent).getStatements();
    return statements.get(statements.size() - 1) == expression;
  }

  private static boolean jumpElvis(PsiElement parent, KtExpression current) {
    if (!(parent instanceof KtBinaryExpression)) {
      return false;
    }
    KtBinaryExpression elvis = (KtBinaryExpression) parent;
    KtExpression right = elvis.getRight();
    return elvis.getOperationToken() == KtTokens.ELVIS && elvis.getLeft() == current
        && (right instanceof KtExpressionWithLabel || right instanceof KtThrowExpression);
  }

  private static boolean labeledReturn(PsiElement parent, KtExpression current) {
    return parent instanceof KtReturnExpression && ((KtReturnExpression) parent).getReturnedExpression() == current
        && ((KtReturnExpression) parent).getLabelName() != null;
  }
}
