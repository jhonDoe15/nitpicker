package nitpicker.kotlinpsi.metrics;

import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

/**
 * Statement count, control nesting and complexity of one body; nested classes, lambdas and local functions are
 * not entered.
 */
final class Body {
  int statements = 0;
  int maxNesting = 0;
  int complexity = 1;
  int blocks = 0;

  void visit(PsiElement element, int depth) {
    if (element == null
        || element instanceof KtClassOrObject
        || element instanceof KtLambdaExpression
        || element instanceof KtNamedFunction) {
      return;
    }
    int next = isControl(element) && !isElseIf(element) ? depth + 1 : depth;
    maxNesting = Math.max(maxNesting, next);
    count(element);
    for (PsiElement child : element.getChildren()) {
      visit(child, next);
    }
  }

  private void count(PsiElement element) {
    if (element instanceof KtBlockExpression) {
      blocks += 1;
      statements += ((KtBlockExpression) element).getStatements().size();
    } else if (element instanceof KtIfExpression) {
      KtIfExpression expression = (KtIfExpression) element;
      complexity += 1;
      unbraced(expression, expression.getThen());
      unbraced(expression, expression.getElse());
    } else if (element instanceof KtLoopExpression) {
      complexity += 1;
      unbraced(element, ((KtLoopExpression) element).getBody());
    } else if (element instanceof KtWhenEntry) {
      KtWhenEntry entry = (KtWhenEntry) element;
      complexity += entry.isElse() ? 0 : 1;
      unbraced(element.getParent(), entry.getExpression());
    } else if (element instanceof KtCatchClause) {
      complexity += 1;
    } else if (element instanceof KtBinaryExpression) {
      Object token = ((KtBinaryExpression) element).getOperationToken();
      complexity += token == KtTokens.ANDAND || token == KtTokens.OROR || token == KtTokens.ELVIS ? 1 : 0;
    }
  }

  /** A branch without braces is a statement of its own when the construct is a statement. */
  private void unbraced(PsiElement construct, KtExpression branch) {
    if (branch != null && !(branch instanceof KtBlockExpression) && statement(construct)) {
      statements += 1;
    }
  }

  private static boolean statement(PsiElement construct) {
    PsiElement parent = construct.getParent();
    return parent instanceof KtBlockExpression || parent instanceof KtContainerNodeForControlStructureBody
        || parent instanceof KtWhenEntry;
  }

  private static boolean isElseIf(PsiElement element) {
    PsiElement container = element.getParent();
    return element instanceof KtIfExpression
        && container instanceof KtContainerNodeForControlStructureBody
        && container.getParent() instanceof KtIfExpression
        && ((KtIfExpression) container.getParent()).getElse() == element;
  }

  private static boolean isControl(PsiElement element) {
    return element instanceof KtIfExpression
        || element instanceof KtLoopExpression
        || element instanceof KtWhenExpression
        || element instanceof KtCatchClause;
  }
}
