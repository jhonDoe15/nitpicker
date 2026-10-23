package nitpicker.kotlinpsi.catches;

import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.psi.KtAnnotatedExpression;
import org.jetbrains.kotlin.psi.KtBlockExpression;
import org.jetbrains.kotlin.psi.KtBreakExpression;
import org.jetbrains.kotlin.psi.KtCallExpression;
import org.jetbrains.kotlin.psi.KtCatchClause;
import org.jetbrains.kotlin.psi.KtContinueExpression;
import org.jetbrains.kotlin.psi.KtDotQualifiedExpression;
import org.jetbrains.kotlin.psi.KtExpression;
import org.jetbrains.kotlin.psi.KtFinallySection;
import org.jetbrains.kotlin.psi.KtIfExpression;
import org.jetbrains.kotlin.psi.KtLabeledExpression;
import org.jetbrains.kotlin.psi.KtLambdaExpression;
import org.jetbrains.kotlin.psi.KtLoopExpression;
import org.jetbrains.kotlin.psi.KtNameReferenceExpression;
import org.jetbrains.kotlin.psi.KtParenthesizedExpression;
import org.jetbrains.kotlin.psi.KtReturnExpression;
import org.jetbrains.kotlin.psi.KtThrowExpression;
import org.jetbrains.kotlin.psi.KtTryExpression;
import org.jetbrains.kotlin.psi.KtValueArgument;
import org.jetbrains.kotlin.psi.KtWhenEntry;
import org.jetbrains.kotlin.psi.KtWhenExpression;

final class Handler {
  private static final Set<String> REPORTING =
      Set.of(
          "trace", "debug", "info", "warn", "warning", "error", "severe", "fine", "finer", "finest", "config",
          "log", "print", "println", "printStackTrace", "printf", "format");
  private static final Pattern LOGGER = Pattern.compile("(?i)(?:^|\\.)(?:log|logger|logging|timber)\\w*$");
  private static final Pattern LIVENESS =
      Pattern.compile("\\b(?:isActive|isCancelled|isCompleted|coroutineContext|currentCoroutineContext)\\b");

  private final String caught;
  private final List<String> handling;
  private final boolean liveness;
  private final Pattern mention;

  Handler(String caught, List<String> handling, boolean liveness) {
    this.caught = caught;
    this.handling = handling;
    this.liveness = liveness;
    this.mention = Pattern.compile("(?<![\\w.])" + Pattern.quote(caught) + "\\b");
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
    if (element instanceof KtLoopExpression) {
      return handoff(element) ? Flow.STOPS : new Flow(true, returns(element));
    }
    return leaf(element);
  }

  private Flow leaf(PsiElement element) {
    if (handoff(element)) {
      return Flow.STOPS;
    }
    if (element instanceof KtReturnExpression || element instanceof KtBreakExpression
        || element instanceof KtContinueExpression) {
      return Flow.LEAVES;
    }
    return new Flow(true, returns(element));
  }

  private Flow block(KtBlockExpression block) {
    boolean reachable = true;
    boolean leaves = false;
    for (KtExpression statement : block.getStatements()) {
      Flow flow = flow(statement);
      leaves |= flow.leaves;
      reachable = flow.falls;
      if (!reachable) {
        break;
      }
    }
    return new Flow(reachable, leaves);
  }

  private Flow branch(KtIfExpression expression) {
    Flow then = flow(expression.getThen());
    Flow otherwise = expression.getElse() == null ? Flow.FALLS : flow(expression.getElse());
    return guarded(expression.getCondition(), then, otherwise) ? Flow.STOPS : then.or(otherwise);
  }

  private Flow branch(KtWhenExpression expression) {
    Flow all = new Flow(false, false);
    boolean stops = false;
    boolean guard = expression.getSubjectExpression() != null && guards(expression.getSubjectExpression());
    for (KtWhenEntry entry : expression.getEntries()) {
      Flow flow = flow(entry.getExpression());
      stops |= !flow.completes();
      guard |= entry.getConditions().length > 0 && guards(entry.getConditions()[0]);
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

  private boolean guarded(KtExpression condition, Flow then, Flow otherwise) {
    return condition != null && guards(condition) && (!then.completes() || !otherwise.completes());
  }

  private boolean guards(PsiElement condition) {
    String text = condition.getText();
    return mention.matcher(text).find() || (liveness && LIVENESS.matcher(text).find());
  }

  private boolean returns(PsiElement element) {
    for (KtReturnExpression found : PsiTreeUtil.findChildrenOfType(element, KtReturnExpression.class)) {
      if (PsiTreeUtil.getParentOfType(found, KtLambdaExpression.class, true, element.getClass()) == null) {
        return true;
      }
    }
    return element instanceof KtReturnExpression;
  }

  private boolean handoff(PsiElement element) {
    for (KtCallExpression call : PsiTreeUtil.collectElementsOfType(element, KtCallExpression.class)) {
      if (handles(call)) {
        return true;
      }
    }
    return element instanceof KtCallExpression && handles((KtCallExpression) element);
  }

  private boolean handles(KtCallExpression call) {
    String name = nameOf(call.getCalleeExpression());
    if (name != null && handling.contains(name)) {
      return true;
    }
    if (isReporting(call, name)) {
      return false;
    }
    return mentionsCaught(call) || throwsInLambda(call) || hasCaughtReceiver(call);
  }

  private boolean isReporting(KtCallExpression call, String name) {
    if (name != null && REPORTING.contains(name)) {
      return true;
    }
    KtExpression receiver = receiverOf(call);
    return receiver != null && LOGGER.matcher(receiver.getText()).find();
  }

  private boolean mentionsCaught(KtCallExpression call) {
    for (KtValueArgument argument : call.getValueArguments()) {
      KtExpression expression = argument.getArgumentExpression();
      boolean lambda = expression instanceof KtLambdaExpression;
      if (expression != null && !lambda && mention.matcher(expression.getText()).find()) {
        return true;
      }
    }
    return false;
  }

  private boolean throwsInLambda(KtCallExpression call) {
    for (KtValueArgument argument : call.getValueArguments()) {
      KtExpression expression = argument.getArgumentExpression();
      if (expression instanceof KtLambdaExpression
          && PsiTreeUtil.findChildOfType(expression, KtThrowExpression.class) != null) {
        return true;
      }
    }
    return false;
  }

  private boolean hasCaughtReceiver(KtCallExpression call) {
    KtExpression receiver = receiverOf(call);
    return receiver instanceof KtNameReferenceExpression
        && caught.equals(((KtNameReferenceExpression) receiver).getReferencedName());
  }

  private static KtExpression receiverOf(KtCallExpression call) {
    PsiElement parent = call.getParent();
    if (parent instanceof KtDotQualifiedExpression) {
      KtDotQualifiedExpression qualified = (KtDotQualifiedExpression) parent;
      return qualified.getSelectorExpression() == call ? qualified.getReceiverExpression() : null;
    }
    return null;
  }
}
