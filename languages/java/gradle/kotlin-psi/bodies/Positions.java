package nitpicker.kotlinpsi.bodies;

import java.util.ArrayList;
import java.util.List;
import java.util.function.IntUnaryOperator;
import nitpicker.kotlinpsi.common.Lines;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
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

  static List<Object> arms(PsiElement start, Lines lines) {
    IntUnaryOperator end = offset -> lines.index(offset) + 1;
    List<Object> arms = new ArrayList<>();
    PsiElement child = start;
    for (PsiElement up = start.getParent(); up != null && !bodyOwner(up); up = up.getParent()) {
      int arm = armOf(up, child, start);
      if (arm >= 0) {
        arms.add(up.getTextOffset() + ":" + arm + leaves(up, arm, end));
      }
      child = up;
    }
    return arms.isEmpty() ? null : arms;
  }

  private static String leaves(PsiElement up, int arm, IntUnaryOperator end) {
    if (!(up instanceof KtIfExpression)) {
      return "";
    }
    KtExpression branch = arm == 0 ? ((KtIfExpression) up).getThen() : ((KtIfExpression) up).getElse();
    KtExpression last = branch instanceof KtBlockExpression && !((KtBlockExpression) branch).getStatements().isEmpty()
        ? ((KtBlockExpression) branch).getStatements().get(((KtBlockExpression) branch).getStatements().size() - 1)
        : branch;
    return last instanceof KtReturnExpression || last instanceof KtThrowExpression
        ? ":" + end.applyAsInt(up.getTextRange().getEndOffset() - 1) : "";
  }

  private static boolean bodyOwner(PsiElement element) {
    return element instanceof KtDeclarationWithBody && !(element instanceof KtFunctionLiteral)
        || element instanceof KtClassOrObject || element instanceof KtFile;
  }

  private static int armOf(PsiElement up, PsiElement child, PsiElement start) {
    if (up instanceof KtIfExpression) {
      KtIfExpression branching = (KtIfExpression) up;
      return inside(branching.getThen(), start) ? 0 : inside(branching.getElse(), start) ? 1 : -1;
    }
    if (up instanceof KtWhenExpression && child instanceof KtWhenEntry) {
      KtWhenEntry entry = (KtWhenEntry) child;
      return inside(entry.getExpression(), start) ? ((KtWhenExpression) up).getEntries().indexOf(entry) : -1;
    }
    if (up instanceof KtTryExpression) {
      KtTryExpression attempt = (KtTryExpression) up;
      return child == attempt.getTryBlock() ? 0 : child instanceof KtCatchClause
          ? attempt.getCatchClauses().indexOf(child) + 1 : -1;
    }
    return -1;
  }

  private static boolean inside(PsiElement container, PsiElement start) {
    return container != null && PsiTreeUtil.isAncestor(container, start, false);
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
