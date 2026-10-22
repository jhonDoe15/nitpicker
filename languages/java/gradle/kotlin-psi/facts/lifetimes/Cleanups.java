package nitpicker.kotlinpsi.facts.lifetimes;

import static nitpicker.kotlinpsi.common.Psi.*;

import java.util.*;
import java.util.function.IntUnaryOperator;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;
import org.jetbrains.kotlin.resolve.ImportPath;

final class Cleanups {
  private static final String CANCELLATION = "CancellationException";
  private static final Set<String> INLINE =
      Hosts.names("let", "run", "also", "apply", "with", "use", "runCatching", "repeat", "forEach",
          "forEachIndexed", "map", "mapNotNull", "filter", "takeIf", "takeUnless", "synchronized");

  private final Shields shields;
  private final IntUnaryOperator lines;
  private final Set<String> cancellations = Hosts.names(CANCELLATION);
  private final Set<Integer> seen = new HashSet<>();
  final List<Object> calls = new ArrayList<>();

  Cleanups(KtFile file, Shields shields, IntUnaryOperator lines) {
    this.shields = shields;
    this.lines = lines;
    for (KtImportDirective directive : file.getImportDirectives()) {
      ImportPath path = directive.getImportPath();
      if (path != null && !path.isAllUnder() && path.getAlias() != null
          && path.getFqName().shortName().asString().equals(CANCELLATION)) {
        cancellations.add(path.getAlias().asString());
      }
    }
  }

  void tryExpression(KtTryExpression expression, Map<String, Object> function) {
    if (shields.inside(expression)) {
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
    if (shields.shields(call)) {
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
