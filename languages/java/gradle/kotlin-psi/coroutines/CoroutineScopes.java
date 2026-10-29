package nitpicker.kotlinpsi.coroutines;

import static nitpicker.kotlinpsi.common.Psi.clip;
import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.Set;
import java.util.regex.Pattern;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

final class CoroutineScopes {
  record Scope(boolean coroutine, boolean offloaded, String function) {
    static Scope none(String function) {
      return new Scope(false, false, function);
    }
  }

  private static final Set<String> TRANSPARENT =
      Set.of(
          "let", "run", "apply", "also", "with", "takeIf", "takeUnless", "use", "forEach", "forEachIndexed",
          "repeat", "runCatching");
  private static final Set<String> NEW_COROUTINES = Set.of("launch", "async", "produce", "actor");
  private static final Set<String> INHERITING =
      Set.of("coroutineScope", "supervisorScope", "withTimeout", "withTimeoutOrNull");
  private static final Pattern NON_BLOCKING =
      Pattern.compile("^Dispatchers\\.(?:Default|Main|Unconfined)(?:\\.immediate)?(?:\\.limitedParallelism\\(.*\\))?$");
  private static final Pattern BLOCKING = Pattern.compile("\\bIO\\b|Executor|ThreadPool|Thread\\b");

  private CoroutineScopes() {}

  static KtCallExpression hostOf(KtLambdaExpression lambda) {
    PsiElement parent = lambda.getParent();
    while (parent instanceof KtLabeledExpression || parent instanceof KtAnnotatedExpression) {
      parent = parent.getParent();
    }
    if (parent instanceof KtLambdaArgument argument && argument.getParent() instanceof KtCallExpression call) {
      return call;
    }
    if (parent instanceof KtValueArgument argument && argument.getParent() instanceof KtValueArgumentList list
        && list.getParent() instanceof KtCallExpression call) {
      return call;
    }
    return null;
  }

  static Scope of(KtLambdaExpression lambda, Scope enclosing) {
    KtCallExpression host = hostOf(lambda);
    String name = host == null ? null : nameOf(host.getCalleeExpression());
    if (name == null) {
      return Scope.none(enclosing.function());
    }
    boolean explicitReceiver = host.getParent() instanceof KtQualifiedExpression qualified
        && qualified.getSelectorExpression() == host;
    if (TRANSPARENT.contains(name)) {
      return enclosing;
    }
    if (INHERITING.contains(name)) {
      return enclosing.coroutine() ? enclosing : Scope.none(enclosing.function());
    }
    if (name.equals("withContext")) {
      return dispatched(host, enclosing, true);
    }
    if (name.equals("runInterruptible")) {
      return new Scope(true, true, enclosing.function());
    }
    if (NEW_COROUTINES.contains(name)) {
      return launched(host, enclosing, explicitReceiver);
    }
    return Scope.none(enclosing.function());
  }

  private static Scope launched(KtCallExpression host, Scope enclosing, boolean explicitReceiver) {
    KtExpression context = contextArgument(host);
    if (context != null) {
      return dispatched(host, enclosing, false);
    }
    if (explicitReceiver || !enclosing.coroutine()) {
      return Scope.none(enclosing.function());
    }
    return enclosing;
  }

  private static Scope dispatched(KtCallExpression host, Scope enclosing, boolean required) {
    KtExpression context = contextArgument(host);
    String text = context == null ? "" : clip(context);
    if (NON_BLOCKING.matcher(text).matches()) {
      return new Scope(true, false, enclosing.function());
    }
    if (context == null && required) {
      return Scope.none(enclosing.function());
    }
    boolean blocking = BLOCKING.matcher(text).find() || !text.contains("Dispatchers.");
    return blocking ? new Scope(true, true, enclosing.function()) : new Scope(true, false, enclosing.function());
  }

  private static KtExpression contextArgument(KtCallExpression call) {
    for (ValueArgument argument : call.getValueArguments()) {
      if (argument instanceof KtLambdaArgument) {
        continue;
      }
      String label = argument.getArgumentName() == null ? null : argument.getArgumentName().getAsName().asString();
      if (label == null || label.equals("context")) {
        KtExpression expression = argument.getArgumentExpression();
        return expression instanceof KtLambdaExpression ? null : expression;
      }
    }
    return null;
  }
}
