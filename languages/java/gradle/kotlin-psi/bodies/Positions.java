package nitpicker.kotlinpsi.bodies;

import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

final class Positions {
  private static final Pattern CLEANUP =
      Pattern.compile("shutdown|close|stop|terminate|dispose|destroy|release|cancel|clean|abort", Pattern.CASE_INSENSITIVE);

  private Positions() {}

  static Boolean guarded(PsiElement start) {
    PsiElement child = start;
    for (PsiElement up = start.getParent(); up != null && !(up instanceof KtDeclarationWithBody);
        up = up.getParent()) {
      if (up instanceof KtTryExpression && ((KtTryExpression) up).getTryBlock() == child
          && cleansUp((KtTryExpression) up)) {
        return Boolean.TRUE;
      }
      child = up;
    }
    return null;
  }

  private static boolean cleansUp(KtTryExpression attempt) {
    List<PsiElement> handlers = new ArrayList<>();
    for (KtCatchClause clause : attempt.getCatchClauses()) {
      KtExpression body = clause.getCatchBody();
      if (body != null && PsiTreeUtil.findChildOfType(body, KtThrowExpression.class) == null) {
        return true;
      }
      handlers.add(body);
    }
    if (attempt.getFinallyBlock() != null) {
      handlers.add(attempt.getFinallyBlock());
    }
    for (PsiElement handler : handlers) {
      for (KtCallExpression call : PsiTreeUtil.collectElementsOfType(handler, KtCallExpression.class)) {
        String name = nameOf(call.getCalleeExpression());
        if (name != null && CLEANUP.matcher(name).find()) {
          return true;
        }
      }
    }
    return false;
  }

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
