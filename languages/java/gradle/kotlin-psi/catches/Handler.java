package nitpicker.kotlinpsi.catches;

import static nitpicker.kotlinpsi.common.Psi.nameOf;

import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.tree.IElementType;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.KtAnnotatedExpression;
import org.jetbrains.kotlin.psi.KtBinaryExpression;
import org.jetbrains.kotlin.psi.KtBlockExpression;
import org.jetbrains.kotlin.psi.KtBreakExpression;
import org.jetbrains.kotlin.psi.KtCallExpression;
import org.jetbrains.kotlin.psi.KtCatchClause;
import org.jetbrains.kotlin.psi.KtClassOrObject;
import org.jetbrains.kotlin.psi.KtContinueExpression;
import org.jetbrains.kotlin.psi.KtDoWhileExpression;
import org.jetbrains.kotlin.psi.KtExpression;
import org.jetbrains.kotlin.psi.KtExpressionWithLabel;
import org.jetbrains.kotlin.psi.KtFinallySection;
import org.jetbrains.kotlin.psi.KtIfExpression;
import org.jetbrains.kotlin.psi.KtIsExpression;
import org.jetbrains.kotlin.psi.KtLabeledExpression;
import org.jetbrains.kotlin.psi.KtLambdaExpression;
import org.jetbrains.kotlin.psi.KtLoopExpression;
import org.jetbrains.kotlin.psi.KtNameReferenceExpression;
import org.jetbrains.kotlin.psi.KtNamedFunction;
import org.jetbrains.kotlin.psi.KtObjectLiteralExpression;
import org.jetbrains.kotlin.psi.KtParenthesizedExpression;
import org.jetbrains.kotlin.psi.KtPrefixExpression;
import org.jetbrains.kotlin.psi.KtPsiUtil;
import org.jetbrains.kotlin.psi.KtQualifiedExpression;
import org.jetbrains.kotlin.psi.KtReturnExpression;
import org.jetbrains.kotlin.psi.KtSafeQualifiedExpression;
import org.jetbrains.kotlin.psi.KtThrowExpression;
import org.jetbrains.kotlin.psi.KtTryExpression;
import org.jetbrains.kotlin.psi.KtWhenCondition;
import org.jetbrains.kotlin.psi.KtWhenConditionIsPattern;
import org.jetbrains.kotlin.psi.KtWhenConditionWithExpression;
import org.jetbrains.kotlin.psi.KtWhenEntry;
import org.jetbrains.kotlin.psi.KtWhenExpression;

final class Handler {
  private final String caught;
  private final boolean cancellation;
  private final Handling handling;
  private int loops;
  private int lambdas;

  Handler(String caught, boolean cancellation, Handling handling) {
    this.caught = caught;
    this.cancellation = cancellation;
    this.handling = handling;
  }

  boolean completes(KtCatchClause clause, KtFinallySection section) {
    Flow body = flow(clause.getCatchBody());
    Flow after = section == null ? Flow.FALLS : flow(section.getFinalExpression());
    return after.falls ? body.completes() : after.leaves;
  }

  Flow flow(PsiElement element) {
    if (element == null) {
      return Flow.FALLS;
    }
    if (element instanceof KtBlockExpression) {
      return block((KtBlockExpression) element);
    }
    if (element instanceof KtThrowExpression) {
      return Flow.STOPS;
    }
    if (element instanceof KtParenthesizedExpression) {
      return flow(((KtParenthesizedExpression) element).getExpression());
    }
    if (element instanceof KtLabeledExpression) {
      return flow(((KtLabeledExpression) element).getBaseExpression());
    }
    if (element instanceof KtAnnotatedExpression) {
      return flow(((KtAnnotatedExpression) element).getBaseExpression());
    }
    if (element instanceof KtIfExpression) {
      return branch((KtIfExpression) element);
    }
    if (element instanceof KtWhenExpression) {
      return branch((KtWhenExpression) element);
    }
    if (element instanceof KtTryExpression) {
      return attempt((KtTryExpression) element);
    }
    if (element instanceof KtDoWhileExpression) {
      Flow body = looped(((KtDoWhileExpression) element).getBody());
      return body.completes() ? new Flow(true, body.leaves) : Flow.STOPS;
    }
    if (element instanceof KtLoopExpression) {
      return new Flow(true, returns(element));
    }
    return leaf(element);
  }

  private Flow looped(PsiElement body) {
    loops++;
    try {
      return flow(body);
    } finally {
      loops--;
    }
  }

  private Flow invoked(KtLambdaExpression lambda) {
    lambdas++;
    try {
      return flow(lambda.getBodyExpression());
    } finally {
      lambdas--;
    }
  }

  private Flow leaf(PsiElement element) {
    KtLambdaExpression once = element instanceof KtCallExpression
        ? Handling.onceLambda((KtCallExpression) element) : null;
    if (once != null) {
      Flow inner = invoked(once);
      return handling.stops((KtCallExpression) element) ? Flow.STOPS : inner;
    }
    if (runs(element)) {
      return Flow.STOPS;
    }
    if (element instanceof KtReturnExpression) {
      return lambdas > 0 && ((KtReturnExpression) element).getLabelName() != null ? Flow.FALLS : Flow.LEAVES;
    }
    if (element instanceof KtBreakExpression || element instanceof KtContinueExpression) {
      boolean local = loops > 0 && ((KtExpressionWithLabel) element).getLabelName() == null;
      return local ? Flow.FALLS : Flow.LEAVES;
    }
    return new Flow(true, returns(element));
  }

  private boolean runs(PsiElement element) {
    if (element == null || element instanceof KtLambdaExpression || element instanceof KtNamedFunction
        || element instanceof KtObjectLiteralExpression || element instanceof KtClassOrObject
        || element instanceof KtLoopExpression && !(element instanceof KtDoWhileExpression)) {
      return false;
    }
    if (element instanceof KtThrowExpression || element instanceof KtDoWhileExpression
        || element instanceof KtIfExpression || element instanceof KtWhenExpression
        || element instanceof KtTryExpression) {
      return !flow(element).completes();
    }
    if (element instanceof KtCallExpression) {
      KtLambdaExpression once = Handling.onceLambda((KtCallExpression) element);
      if (handling.stops((KtCallExpression) element) || once != null && !invoked(once).completes()) {
        return true;
      }
    }
    if (element instanceof KtBinaryExpression && conditional(((KtBinaryExpression) element).getOperationToken())) {
      return runs(((KtBinaryExpression) element).getLeft());
    }
    if (element instanceof KtSafeQualifiedExpression) {
      return runs(((KtSafeQualifiedExpression) element).getReceiverExpression());
    }
    for (PsiElement child : element.getChildren()) {
      if (runs(child)) {
        return true;
      }
    }
    return false;
  }

  private static boolean conditional(IElementType token) {
    return token == KtTokens.ANDAND || token == KtTokens.OROR || token == KtTokens.ELVIS;
  }

  private static boolean returns(PsiElement element) {
    for (KtReturnExpression found : PsiTreeUtil.findChildrenOfType(element, KtReturnExpression.class)) {
      if (PsiTreeUtil.getParentOfType(found, KtLambdaExpression.class, true, element.getClass()) == null) {
        return true;
      }
    }
    return element instanceof KtReturnExpression;
  }

  private Flow block(KtBlockExpression block) {
    boolean leaves = false;
    for (KtExpression statement : block.getStatements()) {
      Flow flow = flow(statement);
      leaves |= flow.leaves;
      if (!flow.falls) {
        return new Flow(false, leaves);
      }
    }
    return new Flow(true, leaves);
  }

  private Flow branch(KtIfExpression expression) {
    if (runs(expression.getCondition())) {
      return Flow.STOPS;
    }
    Flow then = flow(expression.getThen());
    Flow otherwise = expression.getElse() == null ? Flow.FALLS : flow(expression.getElse());
    boolean oneStops = !then.completes() || !otherwise.completes();
    return oneStops && guards(expression.getCondition()) ? Flow.STOPS : then.or(otherwise);
  }

  private Flow branch(KtWhenExpression expression) {
    if (runs(expression.getSubjectExpression())) {
      return Flow.STOPS;
    }
    boolean subject = isCaught(expression.getSubjectExpression());
    Flow all = expression.getElseExpression() == null ? Flow.FALLS : Flow.STOPS;
    boolean stops = false;
    boolean guard = false;
    for (KtWhenEntry entry : expression.getEntries()) {
      Flow flow = flow(entry.getExpression());
      stops |= !flow.completes();
      for (KtWhenCondition condition : entry.getConditions()) {
        guard |= subject && condition instanceof KtWhenConditionIsPattern
            || condition instanceof KtWhenConditionWithExpression
                && guards(((KtWhenConditionWithExpression) condition).getExpression());
      }
      all = all.or(flow);
    }
    return guard && stops ? Flow.STOPS : all;
  }

  private Flow attempt(KtTryExpression expression) {
    Flow all = flow(expression.getTryBlock());
    for (KtCatchClause clause : expression.getCatchClauses()) {
      all = all.or(flow(clause.getCatchBody()));
    }
    KtFinallySection section = expression.getFinallyBlock();
    if (section == null) {
      return all;
    }
    Flow after = flow(section.getFinalExpression());
    return after.falls ? all : new Flow(false, after.leaves);
  }

  private boolean guards(KtExpression condition) {
    KtExpression plain = KtPsiUtil.safeDeparenthesize(condition);
    if (plain instanceof KtPrefixExpression && ((KtPrefixExpression) plain).getOperationToken() == KtTokens.EXCL) {
      return guards(((KtPrefixExpression) plain).getBaseExpression());
    }
    if (plain instanceof KtIsExpression) {
      return isCaught(((KtIsExpression) plain).getLeftHandSide());
    }
    return cancellation && liveness(plain);
  }

  private static boolean liveness(KtExpression expression) {
    KtExpression name = expression instanceof KtQualifiedExpression
        ? ((KtQualifiedExpression) expression).getSelectorExpression() : expression;
    return name instanceof KtNameReferenceExpression && "isActive".equals(nameOf(name));
  }

  private boolean isCaught(KtExpression expression) {
    KtExpression plain = KtPsiUtil.safeDeparenthesize(expression);
    return plain instanceof KtNameReferenceExpression && caught.equals(nameOf(plain));
  }
}
