package nitpicker.kotlinpsi.facts.lifetimes;

import static nitpicker.kotlinpsi.common.Psi.*;

import java.util.*;
import java.util.function.IntUnaryOperator;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

final class Cleanups {
  private static final String CANCELLATION = "CancellationException";
  private static final String SHIELD = "NonCancellable";
  private static final Set<String> INLINE =
      Hosts.names("let", "run", "also", "apply", "with", "use", "runCatching", "repeat", "forEach",
          "forEachIndexed", "map", "mapNotNull", "filter", "takeIf", "takeUnless", "synchronized");

  private final IntUnaryOperator lines;
  private final Set<String> cancellations;
  private final Set<String> shieldNames;
  private final Set<Integer> seen = new HashSet<>();
  final List<Object> calls = new ArrayList<>();

  Cleanups(KtFile file, IntUnaryOperator lines) {
    this.lines = lines;
    this.cancellations = Hosts.aliases(file, CANCELLATION);
    this.shieldNames = Hosts.aliases(file, SHIELD);
  }

  boolean shieldsWholeBody(KtNamedFunction function) {
    KtExpression body = function.getBodyExpression();
    if (body instanceof KtBlockExpression) {
      List<KtExpression> statements = ((KtBlockExpression) body).getStatements();
      body = statements.size() == 1 ? statements.get(0) : null;
    }
    if (body instanceof KtReturnExpression) {
      body = ((KtReturnExpression) body).getReturnedExpression();
    }
    body = Hosts.unwrap(body);
    return body instanceof KtCallExpression
        && "withContext".equals(nameOf(((KtCallExpression) body).getCalleeExpression()))
        && shields((KtCallExpression) body);
  }

  private boolean shields(KtCallExpression call) {
    if (Hosts.lambdas(call).isEmpty()) {
      return false;
    }
    for (ValueArgument argument : call.getValueArguments()) {
      KtExpression expression = argument.getArgumentExpression();
      if (expression != null && !(expression instanceof KtLambdaExpression)
          && Hosts.mentions(expression, shieldNames)) {
        return true;
      }
    }
    return false;
  }

  private boolean insideShield(PsiElement element) {
    for (PsiElement parent = element.getParent(); parent != null; parent = parent.getParent()) {
      if (Hosts.isBoundary(parent)) {
        return false;
      }
      if (parent instanceof KtLambdaExpression) {
        KtCallExpression host = Hosts.of((KtLambdaExpression) parent);
        if (host != null && shields(host)) {
          return true;
        }
      }
    }
    return false;
  }

  void tryExpression(KtTryExpression expression, Map<String, Object> function) {
    if (insideShield(expression)) {
      return;
    }
    KtFinallySection section = expression.getFinallyBlock();
    if (section != null) {
      visit(section.getFinalExpression(), "finally", function);
    }
    boolean timed = containsCall(expression.getTryBlock(), "withTimeout");
    for (KtCatchClause clause : expression.getCatchClauses()) {
      if (!timed && catchesCancellation(clause)) {
        visit(clause.getCatchBody(), "catch", function);
      }
    }
  }

  private boolean catchesCancellation(KtCatchClause clause) {
    KtParameter parameter = clause.getCatchParameter();
    if (parameter == null || parameter.getTypeReference() == null) {
      return false;
    }
    String type = parameter.getTypeReference().getText().replace("?", "").trim();
    return cancellations.contains(type.substring(type.lastIndexOf('.') + 1));
  }

  private static boolean containsCall(PsiElement element, String name) {
    if (element instanceof KtCallExpression
        && name.equals(nameOf(((KtCallExpression) element).getCalleeExpression()))) {
      return true;
    }
    for (PsiElement child : element.getChildren()) {
      if (containsCall(child, name)) {
        return true;
      }
    }
    return false;
  }

  private void visit(PsiElement element, String section, Map<String, Object> function) {
    if (element == null || element instanceof KtLambdaExpression || Hosts.isBoundary(element)) {
      return;
    }
    if (element instanceof KtCallExpression) {
      call((KtCallExpression) element, section, function);
      return;
    }
    for (PsiElement child : element.getChildren()) {
      visit(child, section, function);
    }
  }

  private void call(KtCallExpression call, String section, Map<String, Object> function) {
    if (shields(call)) {
      return;
    }
    String name = nameOf(call.getCalleeExpression());
    if (name != null && seen.add(call.getTextOffset())) {
      calls.add(describe(call, name, section, function));
    }
    for (ValueArgument argument : call.getValueArguments()) {
      KtExpression expression = Hosts.unwrap(argument.getArgumentExpression());
      if (expression instanceof KtLambdaExpression) {
        if (INLINE.contains(name)) {
          visit(((KtLambdaExpression) expression).getBodyExpression(), section, function);
        }
      } else {
        visit(expression, section, function);
      }
    }
  }

  private Map<String, Object> describe(
      KtCallExpression call, String name, String section, Map<String, Object> function) {
    KtExpression receiver = Hosts.receiverOf(call);
    Map<String, Object> fact = m("section", section, "line", lines.applyAsInt(call.getTextOffset()), "name", name);
    fact.putAll(function);
    if ("withContext".equals(name)) {
      fact.put("context", firstArgument(call));
    }
    if (receiver == null) {
      if (call.getCalleeExpression() instanceof KtNameReferenceExpression) {
        Symbols.Declaration declared = Symbols.resolve((KtNameReferenceExpression) call.getCalleeExpression());
        fact.put("calleeType", declared == null ? null : declared.type());
      }
      return fact;
    }
    fact.put("qualifier", clip(receiver));
    KtExpression subject = receiver instanceof KtQualifiedExpression
        && ((KtQualifiedExpression) receiver).getReceiverExpression() instanceof KtThisExpression
        ? ((KtQualifiedExpression) receiver).getSelectorExpression()
        : receiver;
    if (receiver instanceof KtThisExpression) {
      fact.put("receiver", "this");
    } else if (subject instanceof KtNameReferenceExpression) {
      Symbols.Declaration declared = Symbols.resolve((KtNameReferenceExpression) subject);
      fact.put("receiver", "name");
      fact.put("receiverType", declared == null ? null : declared.type());
    } else {
      KtExpression selector = receiver instanceof KtQualifiedExpression
          ? ((KtQualifiedExpression) receiver).getSelectorExpression()
          : receiver;
      fact.put("receiver", selector instanceof KtCallExpression ? "call" : "other");
      fact.put("receiverType",
          selector instanceof KtCallExpression ? Symbols.calleeType((KtCallExpression) selector) : null);
    }
    return fact;
  }

  static String firstArgument(KtCallExpression call) {
    List<KtValueArgument> arguments = call.getValueArguments();
    return arguments.isEmpty() ? null : clip(arguments.get(0).getArgumentExpression());
  }
}
