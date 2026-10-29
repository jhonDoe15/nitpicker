package nitpicker.kotlinpsi.design.syntax;

import java.util.List;
import java.util.Set;
import nitpicker.kotlinpsi.design.Ctx;
import nitpicker.kotlinpsi.design.model.Fun;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

public final class Lambdas {
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
  private static final Set<String> VALUE = Set.of("use", "let", "also", "takeIf", "takeUnless");
  private static final Set<String> ELEMENTS =
      Set.of(
          "forEach", "onEach", "map", "mapNotNull", "flatMap", "filter", "filterNot", "any", "all", "none", "count",
          "find", "first", "firstOrNull", "last", "lastOrNull", "sumOf", "groupBy", "associateBy", "associateWith",
          "partition", "takeWhile", "dropWhile", "removeIf", "distinctBy", "minByOrNull", "maxByOrNull", "sortedBy",
          "sortedByDescending", "sortBy", "indexOfFirst", "indexOfLast");
  private static final Set<String> NO_RECEIVER_ESCAPING =
      Set.of("lazy", "computeIfAbsent", "computeIfPresent", "compute", "merge", "replaceAll", "thenBy",
          "compareBy", "Comparator", "Runnable", "Callable");

  private final Ctx ctx;

  public Lambdas(Ctx ctx) {
    this.ctx = ctx;
  }

  public KtCallExpression host(KtLambdaExpression lambda) {
    PsiElement parent = lambda.getParent();
    while (parent instanceof KtLabeledExpression || parent instanceof KtAnnotatedExpression
        || parent instanceof KtParenthesizedExpression) {
      parent = parent.getParent();
    }
    PsiElement call = parent instanceof KtLambdaArgument ? parent.getParent()
        : parent instanceof KtValueArgument && parent.getParent() != null ? parent.getParent().getParent() : null;
    return call instanceof KtCallExpression ? (KtCallExpression) call : null;
  }

  public KtExpression valueReceiver(PsiElement literal, KtParameter parameter) {
    return hostReceiver(literal, parameter, VALUE);
  }

  public KtExpression elementsOf(PsiElement literal, KtParameter parameter) {
    return hostReceiver(literal, parameter, ELEMENTS);
  }

  private KtExpression hostReceiver(PsiElement literal, KtParameter parameter, Set<String> hosts) {
    if (!(literal instanceof KtFunctionLiteral) || !(literal.getParent() instanceof KtLambdaExpression)) {
      return null;
    }
    KtFunctionLiteral function = (KtFunctionLiteral) literal;
    if (function.getValueParameters().size() > 1
        || parameter != null && function.getValueParameters().get(0) != parameter) {
      return null;
    }
    KtCallExpression host = host((KtLambdaExpression) literal.getParent());
    String name = host == null ? null : Ps.name(host);
    return name != null && hosts.contains(name) ? Ps.receiverOf(host) : null;
  }

  public KtExpression implicitReceiver(KtLambdaExpression lambda) {
    KtCallExpression host = host(lambda);
    String name = host == null ? null : Ps.name(host);
    if ("apply".equals(name) || "run".equals(name)) {
      return Ps.receiverOf(host);
    }
    boolean with = "with".equals(name) && !host.getValueArguments().isEmpty();
    return with ? host.getValueArguments().get(0).getArgumentExpression() : null;
  }

  public boolean transparent(KtLambdaExpression lambda) {
    KtCallExpression host = host(lambda);
    String name = host == null ? null : Ps.name(host);
    return name != null && (PLAIN.contains(name) || RECEIVER.contains(name));
  }

  public boolean receiver(KtLambdaExpression lambda) {
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
    int last = params.size() - 1;
    int index = lambda.getParent() instanceof KtLambdaArgument ? last : argumentIndex(host, lambda, last);
    if (index < 0 || index >= params.size() || params.get(index).getTypeReference() == null) {
      return true;
    }
    KtTypeElement element = params.get(index).getTypeReference().getTypeElement();
    if (element instanceof KtNullableType) {
      element = ((KtNullableType) element).getInnerType();
    }
    return !(element instanceof KtFunctionType) || ((KtFunctionType) element).getReceiverTypeReference() != null;
  }

  private int argumentIndex(KtCallExpression host, KtLambdaExpression lambda, int fallback) {
    int index = fallback;
    List<? extends ValueArgument> arguments = host.getValueArguments();
    for (int i = 0; i < arguments.size(); i++) {
      if (arguments.get(i).getArgumentExpression() == lambda) {
        index = i;
      }
    }
    return index;
  }
}
