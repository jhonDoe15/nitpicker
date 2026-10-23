package nitpicker.kotlinpsi.bodies;

import static nitpicker.kotlinpsi.common.Psi.*;

import java.util.*;
import java.util.function.ToIntFunction;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

final class ExceptionUses {
  private static final int PATH_LIMIT = 3;

  private final ToIntFunction<PsiElement> lineOf;
  private final List<Object> uses = new ArrayList<>();

  ExceptionUses(ToIntFunction<PsiElement> lineOf) {
    this.lineOf = lineOf;
  }

  List<Object> uses() {
    return uses;
  }

  void collect(KtNamedFunction function, Integer scope) {
    Set<String> parameters = new HashSet<>();
    for (KtParameter parameter : function.getValueParameters()) {
      parameters.add(parameter.getName());
    }
    Set<String> locals = new HashSet<>();
    for (KtNameReferenceExpression reference
        : PsiTreeUtil.collectElementsOfType(function.getBodyExpression(), KtNameReferenceExpression.class)) {
      String name = reference.getReferencedName();
      PsiElement parent = reference.getParent();
      boolean selector = parent instanceof KtQualifiedExpression
          && ((KtQualifiedExpression) parent).getSelectorExpression() == reference;
      if (selector || parent instanceof KtCallExpression || !(parameters.contains(name) || locals.contains(name))) {
        continue;
      }
      Map<String, Object> use = use(reference, scope, parameters.contains(name));
      if (use.get("local") != null) {
        locals.add((String) use.get("local"));
      }
      uses.add(use);
    }
  }

  private Map<String, Object> use(KtNameReferenceExpression reference, Integer scope, boolean parameter) {
    List<Object> path = new ArrayList<>();
    KtExpression value = reference;
    while (value.getParent() instanceof KtQualifiedExpression
        && ((KtQualifiedExpression) value.getParent()).getReceiverExpression() == value && path.size() < PATH_LIMIT) {
      value = (KtQualifiedExpression) value.getParent();
      KtExpression selector = ((KtQualifiedExpression) value).getSelectorExpression();
      path.add(selector instanceof KtCallExpression
          ? nameOf(((KtCallExpression) selector).getCalleeExpression()) : nameOf(selector));
    }
    PsiElement parent = value.getParent();
    String context = parent instanceof KtStringTemplateEntry ? "template"
        : parent instanceof KtBinaryExpression && ((KtBinaryExpression) parent).getOperationToken() == KtTokens.PLUS
            ? "concat" : parent instanceof KtValueArgument ? "argument" : null;
    String argumentOf = null;
    if ("argument".equals(context) && parent.getParent() != null
        && parent.getParent().getParent() instanceof KtCallExpression) {
      argumentOf = nameOf(((KtCallExpression) parent.getParent().getParent()).getCalleeExpression());
    }
    return m(
        "line", lineOf.applyAsInt(reference), "scope", scope, "name", reference.getReferencedName(),
        "parameter", parameter, "path", path, "context", context, "argumentOf", argumentOf,
        "calls", enclosingCalls(value), "local", localHolding(value));
  }

  private List<Object> enclosingCalls(PsiElement start) {
    List<Object> calls = new ArrayList<>();
    for (PsiElement up = start.getParent(); up != null && !(up instanceof KtNamedFunction); up = up.getParent()) {
      if (up instanceof KtCallExpression) {
        KtCallExpression call = (KtCallExpression) up;
        PsiElement outer = call.getParent();
        String receiver = outer instanceof KtQualifiedExpression
            && ((KtQualifiedExpression) outer).getSelectorExpression() == call
            ? clip(((KtQualifiedExpression) outer).getReceiverExpression()) : null;
        calls.add(m("name", nameOf(call.getCalleeExpression()), "receiver", receiver));
      }
    }
    return calls;
  }

  private String localHolding(KtExpression value) {
    PsiElement child = value;
    PsiElement parent = value.getParent();
    while (parent instanceof KtStringTemplateEntry || parent instanceof KtStringTemplateExpression
        || parent instanceof KtParenthesizedExpression
        || (parent instanceof KtBinaryExpression
            && (((KtBinaryExpression) parent).getOperationToken() == KtTokens.PLUS
                || ((KtBinaryExpression) parent).getOperationToken() == KtTokens.ELVIS))) {
      child = parent;
      parent = parent.getParent();
    }
    return parent instanceof KtProperty && ((KtProperty) parent).isLocal()
        && ((KtProperty) parent).getInitializer() == child ? ((KtProperty) parent).getName() : null;
  }
}
