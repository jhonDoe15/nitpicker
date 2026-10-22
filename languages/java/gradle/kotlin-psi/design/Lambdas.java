package nitpicker.kotlinpsi.design;

import java.util.List;
import java.util.Set;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

final class Lambdas {
  private static final Set<String> PLAIN =
      Set.of(
          "let", "also", "takeIf", "takeUnless", "repeat", "map", "mapNotNull", "mapIndexed", "flatMap", "filter",
          "filterNot", "filterIsInstance", "forEach", "forEachIndexed", "onEach", "any", "all", "none", "count",
          "sumOf", "sortedBy", "sortedByDescending", "sortBy", "minByOrNull", "maxByOrNull", "find", "firstOrNull",
          "first", "last", "lastOrNull", "indexOfFirst", "indexOfLast", "groupBy", "associate", "associateBy",
          "associateWith", "fold", "reduce", "partition", "takeWhile", "dropWhile", "getOrPut", "getOrElse", "use",
          "synchronized", "withLock", "measureTimeMillis", "measureNanoTime", "mapValues", "mapKeys", "removeIf",
          "sumBy", "distinctBy", "zip", "runningFold", "scan");
  private static final Set<String> RECEIVER =
      Set.of("run", "apply", "with", "buildString", "buildList", "buildMap", "buildSet", "runCatching");
  private static final Set<String> NO_RECEIVER_ESCAPING =
      Set.of("lazy", "computeIfAbsent", "computeIfPresent", "compute", "merge", "replaceAll", "thenBy",
          "compareBy", "Comparator", "Runnable", "Callable");

  private final Ctx ctx;

  Lambdas(Ctx ctx) {
    this.ctx = ctx;
  }

  KtCallExpression host(KtLambdaExpression lambda) {
    PsiElement parent = lambda.getParent();
    while (parent instanceof KtLabeledExpression || parent instanceof KtAnnotatedExpression
        || parent instanceof KtParenthesizedExpression) {
      parent = parent.getParent();
    }
    PsiElement call = parent instanceof KtLambdaArgument ? parent.getParent()
        : parent instanceof KtValueArgument && parent.getParent() != null ? parent.getParent().getParent() : null;
    return call instanceof KtCallExpression ? (KtCallExpression) call : null;
  }

  boolean transparent(KtLambdaExpression lambda) {
    KtCallExpression host = host(lambda);
    String name = host == null ? null : Ps.name(host);
    return name != null && (PLAIN.contains(name) || RECEIVER.contains(name));
  }

  boolean receiver(KtLambdaExpression lambda) {
    KtCallExpression host = host(lambda);
    if (host == null) {
      return declaredWithReceiver(lambda);
    }
    String name = Ps.name(host);
    if (name == null) {
      return true;
    }
    if (RECEIVER.contains(name)) {
      return true;
    }
    if (PLAIN.contains(name) || NO_RECEIVER_ESCAPING.contains(name)) {
      return false;
    }
    Fun target = ctx.calls.target(host);
    return target == null || functionTypeHasReceiver(target, host, lambda);
  }

  private boolean declaredWithReceiver(KtLambdaExpression lambda) {
    PsiElement parent = lambda.getParent();
    if (parent instanceof KtProperty && ((KtProperty) parent).getTypeReference() != null) {
      KtTypeElement element = ((KtProperty) parent).getTypeReference().getTypeElement();
      return element instanceof KtFunctionType && ((KtFunctionType) element).getReceiverTypeReference() != null;
    }
    return false;
  }

  private boolean functionTypeHasReceiver(Fun target, KtCallExpression host, KtLambdaExpression lambda) {
    List<KtParameter> params = target.params;
    int index = params.size() - 1;
    if (!(lambda.getParent() instanceof KtLambdaArgument)) {
      List<? extends ValueArgument> arguments = host.getValueArguments();
      for (int i = 0; i < arguments.size(); i++) {
        if (arguments.get(i).getArgumentExpression() == lambda) {
          index = i;
        }
      }
    }
    if (index < 0 || index >= params.size() || params.get(index).getTypeReference() == null) {
      return true;
    }
    KtTypeElement element = params.get(index).getTypeReference().getTypeElement();
    if (element instanceof KtNullableType) {
      element = ((KtNullableType) element).getInnerType();
    }
    return !(element instanceof KtFunctionType) || ((KtFunctionType) element).getReceiverTypeReference() != null;
  }
}
