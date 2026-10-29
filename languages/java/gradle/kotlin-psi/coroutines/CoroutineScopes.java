package nitpicker.kotlinpsi.coroutines;

import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.Set;
import nitpicker.kotlinpsi.coroutines.Contexts.Kind;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

final class CoroutineScopes {
  record Scope(boolean coroutine, boolean offloaded, String owner, String function) {
    static Scope none(String owner, String function) {
      return new Scope(false, false, owner, function);
    }

    Scope none() {
      return none(owner, function);
    }

    Scope running(boolean offloadedHere) {
      return new Scope(true, offloadedHere, owner, function);
    }
  }

  private static final Set<String> TRANSPARENT =
      Set.of(
          "let", "run", "apply", "also", "with", "takeIf", "takeUnless", "use", "forEach", "forEachIndexed",
          "repeat", "runCatching");
  private static final Set<String> NEW_COROUTINES = Set.of("launch", "async", "produce", "actor");
  private static final Set<String> INHERITING =
      Set.of("coroutineScope", "supervisorScope", "withTimeout", "withTimeoutOrNull");

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

  static Scope of(KtLambdaExpression lambda, Scope enclosing, Set<String> flowBuilders) {
    KtCallExpression host = hostOf(lambda);
    String name = host == null ? null : nameOf(host.getCalleeExpression());
    if (name == null) {
      return enclosing.none();
    }
    KtExpression receiver = receiverOf(host);
    if (TRANSPARENT.contains(name) || InlineScopes.isInlineOperator(name, receiver)) {
      return enclosing;
    }
    if (INHERITING.contains(name)) {
      return enclosing.coroutine() ? enclosing : enclosing.none();
    }
    if (name.equals("withContext")) {
      return switched(host, enclosing);
    }
    if (name.equals("runInterruptible")) {
      return enclosing.running(true);
    }
    if (NEW_COROUTINES.contains(name)) {
      return launched(host, enclosing, receiver != null);
    }
    if (receiver == null && flowBuilders.contains(name)) {
      return enclosing.running(InlineScopes.flowsOnOffloaded(host));
    }
    return enclosing.none();
  }

  static KtExpression receiverOf(KtCallExpression call) {
    PsiElement parent = call.getParent();
    return parent instanceof KtQualifiedExpression qualified && qualified.getSelectorExpression() == call
        ? qualified.getReceiverExpression()
        : null;
  }

  private static Scope switched(KtCallExpression host, Scope enclosing) {
    Kind kind = Contexts.of(contextArgument(host));
    if (kind == Kind.NONE) {
      return enclosing.coroutine() ? enclosing : enclosing.none();
    }
    return enclosing.running(kind == Kind.OFFLOADED);
  }

  private static Scope launched(KtCallExpression host, Scope enclosing, boolean explicitReceiver) {
    Kind kind = Contexts.of(contextArgument(host));
    if (kind != Kind.NONE) {
      return enclosing.running(kind == Kind.OFFLOADED);
    }
    if (explicitReceiver || !enclosing.coroutine()) {
      return enclosing.none();
    }
    return enclosing;
  }

  static KtExpression contextArgument(KtCallExpression call) {
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
