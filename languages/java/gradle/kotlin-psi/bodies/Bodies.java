package nitpicker.kotlinpsi.bodies;

import static nitpicker.kotlinpsi.common.Psi.*;

import java.util.*;
import nitpicker.kotlinpsi.common.Frame;
import nitpicker.kotlinpsi.common.Lines;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

/** Call sites, assignments, catches and returns of the main sources, each tied to its enclosing scope. */
public final class Bodies {
  private static final int CHAIN_LIMIT = 12;

  private final boolean active;
  private final Lines lines;
  private final ScopeTable scopes = new ScopeTable();
  private final List<Object> invocations = new ArrayList<>();
  private final List<Object> catches = new ArrayList<>();
  private final List<Object> literals = new ArrayList<>();
  private final List<Object> nullReturns = new ArrayList<>();
  private final ExceptionUses exceptionUses;

  public Bodies(String text, boolean test) {
    this.active = !test;
    this.lines = new Lines(text);
    this.exceptionUses = new ExceptionUses(this::lineOf);
  }

  int lineOf(PsiElement element) {
    return lines.index(element.getTextRange().getStartOffset()) + 1;
  }

  public void function(Frame inner, KtNamedFunction function) {
    if (!active) {
      return;
    }
    Map<String, Object> detail = m("line", lines.index(function.getTextOffset()) + 1);
    KtExpression body = function.getBodyExpression();
    if ("hashCode".equals(function.getName()) && function.getValueParameters().isEmpty() && body != null) {
      Set<String> reads = new TreeSet<>();
      for (KtNameReferenceExpression name : PsiTreeUtil.collectElementsOfType(body, KtNameReferenceExpression.class)) {
        reads.add(name.getReferencedName());
      }
      detail.put("reads", new ArrayList<Object>(reads));
    }
    scopes.describe(inner, detail);
    if (body instanceof KtConstantExpression && "null".equals(body.getText())) {
      nullReturns.add(m("line", lineOf(body), "scope", scopes.id(inner)));
    }
    if (annotationNames(function).contains("ExceptionHandler") && body != null) {
      exceptionUses.collect(function, scopes.id(inner));
    }
  }

  public void observe(PsiElement element, Frame frame) {
    if (!active) {
      return;
    }
    if (element instanceof KtCallExpression) {
      call((KtCallExpression) element, frame);
    } else if (element instanceof KtBinaryExpression) {
      assignment((KtBinaryExpression) element, frame);
    } else if (element instanceof KtCatchClause) {
      catchClause((KtCatchClause) element, frame);
    } else if (element instanceof KtProperty && ((KtProperty) element).isLocal()) {
      KtProperty local = (KtProperty) element;
      if (Initializers.isLiteral(local.getInitializer())) {
        literals.add(m("name", local.getName(), "scope", scopes.id(frame)));
      }
    } else if (element instanceof KtReturnExpression) {
      KtReturnExpression returned = (KtReturnExpression) element;
      KtExpression value = returned.getReturnedExpression();
      if (returned.getLabeledExpression() == null && value instanceof KtConstantExpression
          && "null".equals(value.getText())) {
        nullReturns.add(m("line", lineOf(returned), "scope", scopes.id(frame)));
      }
    } else if (element instanceof KtCallableReferenceExpression) {
      KtCallableReferenceExpression reference = (KtCallableReferenceExpression) element;
      record(element, frame, m("name", reference.getCallableReference().getReferencedName(), "reference", true,
          "receiver", clip(reference.getReceiverExpression())));
    }
  }

  private void call(KtCallExpression call, Frame frame) {
    String name = nameOf(call.getCalleeExpression());
    if (name == null) {
      return;
    }
    Map<String, Object> data = m("name", name, "arguments", arguments(call));
    if (call.getParent() instanceof KtQualifiedExpression
        && ((KtQualifiedExpression) call.getParent()).getSelectorExpression() == call) {
      KtQualifiedExpression qualified = (KtQualifiedExpression) call.getParent();
      data.put("receiver", clip(qualified.getReceiverExpression()));
      data.put("safe", qualified instanceof KtSafeQualifiedExpression ? Boolean.TRUE : null);
      data.put("previous", callOf(qualified.getReceiverExpression()));
      chained(qualified, data);
    } else {
      chained(call, data);
    }
    record(call, frame, data);
  }

  private Map<String, Object> callOf(KtExpression expression) {
    KtExpression selector = expression instanceof KtQualifiedExpression
        ? ((KtQualifiedExpression) expression).getSelectorExpression() : expression;
    if (!(selector instanceof KtCallExpression)) {
      return null;
    }
    KtCallExpression call = (KtCallExpression) selector;
    return m("name", nameOf(call.getCalleeExpression()), "arguments", arguments(call));
  }

  private void chained(KtExpression top, Map<String, Object> data) {
    List<Object> after = new ArrayList<>();
    KtExpression outer = top;
    while (outer.getParent() instanceof KtQualifiedExpression
        && ((KtQualifiedExpression) outer.getParent()).getReceiverExpression() == outer) {
      outer = (KtQualifiedExpression) outer.getParent();
      KtExpression selector = ((KtQualifiedExpression) outer).getSelectorExpression();
      String next = selector instanceof KtCallExpression
          ? nameOf(((KtCallExpression) selector).getCalleeExpression()) : nameOf(selector);
      if (next != null && after.size() < CHAIN_LIMIT) {
        after.add(next);
      }
    }
    PsiElement parent = outer.getParent();
    data.put("after", after.isEmpty() ? null : after);
    data.put("statement", parent instanceof KtBlockExpression ? Boolean.TRUE : null);
    data.put("returned", parent instanceof KtReturnExpression
        || (parent instanceof KtDeclarationWithBody && ((KtDeclarationWithBody) parent).getBodyExpression() == outer)
        ? Boolean.TRUE : null);
    if (parent instanceof KtProperty && ((KtProperty) parent).getInitializer() == outer) {
      data.put("assignedTo", ((KtProperty) parent).getName());
    } else if (parent instanceof KtBinaryExpression && ((KtBinaryExpression) parent).getRight() == outer
        && ((KtBinaryExpression) parent).getOperationToken() == KtTokens.EQ) {
      data.put("assignedTo", clip(((KtBinaryExpression) parent).getLeft()));
    }
  }

  private void assignment(KtBinaryExpression expression, Frame frame) {
    Object token = expression.getOperationToken();
    KtExpression left = expression.getLeft();
    Map<String, Object> value = m("text", clip(expression.getRight()));
    if (token == KtTokens.PLUSEQ || token == KtTokens.MINUSEQ) {
      String name = token == KtTokens.PLUSEQ ? "plusAssign" : "minusAssign";
      record(expression, frame, m("name", name, "receiver", clip(left), "assign", true, "arguments", List.of(value)));
    } else if (token == KtTokens.EQ && left instanceof KtArrayAccessExpression) {
      KtArrayAccessExpression access = (KtArrayAccessExpression) left;
      record(expression, frame, m("name", "set", "receiver", clip(access.getArrayExpression()), "assign", true,
          "arguments", List.of(value)));
    } else if (token == KtTokens.EQ && left instanceof KtQualifiedExpression) {
      KtQualifiedExpression qualified = (KtQualifiedExpression) left;
      record(expression, frame, m("name", nameOf(qualified.getSelectorExpression()),
          "receiver", clip(qualified.getReceiverExpression()), "assign", true, "arguments", List.of(value)));
    } else if (token == KtTokens.EQ && left instanceof KtNameReferenceExpression) {
      record(expression, frame, m("name", nameOf(left), "assign", true, "arguments", List.of(value)));
    }
  }

  private void catchClause(KtCatchClause clause, Frame frame) {
    KtParameter parameter = clause.getCatchParameter();
    if (parameter == null || parameter.getTypeReference() == null) {
      return;
    }
    catches.add(
        m("line", lineOf(clause), "scope", scopes.id(frame), "name", parameter.getName(),
            "type", clip(parameter.getTypeReference()),
            "throws", PsiTreeUtil.findChildOfType(clause.getCatchBody(), KtThrowExpression.class) != null));
  }

  private void record(PsiElement element, Frame frame, Map<String, Object> data) {
    if (data.get("name") == null) {
      return;
    }
    Map<String, Object> entry = m("line", lineOf(element), "scope", scopes.id(frame));
    entry.putAll(data);
    invocations.add(entry);
  }

  public Map<String, Object> result() {
    return active
        ? m("scopes", scopes.entries(), "invocations", invocations, "catches", catches, "literals", literals,
            "nullReturns", nullReturns, "exceptionUses", exceptionUses.uses())
        : Map.of();
  }
}
