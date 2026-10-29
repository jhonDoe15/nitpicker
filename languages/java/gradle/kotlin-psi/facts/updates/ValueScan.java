package nitpicker.kotlinpsi.facts.updates;

import static nitpicker.kotlinpsi.common.Psi.m;
import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.*;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

final class ValueScan {
  static final Set<Object> ASSIGNMENTS =
      Set.of(KtTokens.EQ, KtTokens.PLUSEQ, KtTokens.MINUSEQ, KtTokens.MULTEQ, KtTokens.DIVEQ, KtTokens.PERCEQ);

  final List<Object> items = new ArrayList<>();
  boolean branching;

  static String assignedName(KtBinaryExpression assignment) {
    if (!ASSIGNMENTS.contains(assignment.getOperationToken())) {
      return null;
    }
    return assignment.getLeft() instanceof KtNameReferenceExpression ? nameOf(assignment.getLeft()) : null;
  }

  static List<Object> writes(PsiElement statement, KtBinaryExpression own) {
    Set<String> names = new TreeSet<>(Comparator.nullsFirst(Comparator.naturalOrder()));
    for (KtBinaryExpression binary : PsiTreeUtil.findChildrenOfType(statement, KtBinaryExpression.class)) {
      if (binary != own && assignedName(binary) != null) {
        names.add(assignedName(binary));
      }
    }
    if (statement instanceof KtBinaryExpression binary && binary != own && assignedName(binary) != null) {
      names.add(assignedName(binary));
    }
    for (KtUnaryExpression unary : PsiTreeUtil.findChildrenOfType(statement, KtUnaryExpression.class)) {
      Object token = unary.getOperationToken();
      if ((token == KtTokens.PLUSPLUS || token == KtTokens.MINUSMINUS)
          && unary.getBaseExpression() instanceof KtNameReferenceExpression) {
        names.add(nameOf(unary.getBaseExpression()));
      }
    }
    for (KtDestructuringDeclarationEntry entry :
        PsiTreeUtil.findChildrenOfType(statement, KtDestructuringDeclarationEntry.class)) {
      names.add(entry.getName());
    }
    names.remove(null);
    return new ArrayList<>(names);
  }

  void walk(PsiElement element) {
    if (element instanceof KtLambdaExpression
        || element instanceof KtFunction
        || element instanceof KtClassOrObject) {
      return;
    }
    if (element instanceof KtIfExpression || element instanceof KtWhenExpression
        || element instanceof KtTryExpression) {
      branching = true;
    } else if (element instanceof KtBinaryExpression) {
      Object token = ((KtBinaryExpression) element).getOperationToken();
      branching |= token == KtTokens.ELVIS || token == KtTokens.ANDAND || token == KtTokens.OROR;
    }
    if (element instanceof KtQualifiedExpression) {
      qualified((KtQualifiedExpression) element);
    } else if (element instanceof KtCallExpression) {
      call((KtCallExpression) element, null);
    } else if (element instanceof KtNameReferenceExpression) {
      items.add(m("k", "read", "name", nameOf(element), "viaThis", false));
    } else {
      for (PsiElement child : element.getChildren()) {
        walk(child);
      }
    }
  }

  private void qualified(KtQualifiedExpression expression) {
    KtExpression receiver = expression.getReceiverExpression();
    walk(receiver);
    KtExpression selector = expression.getSelectorExpression();
    if (selector instanceof KtCallExpression) {
      call((KtCallExpression) selector, receiverOf(receiver));
    } else if (receiver instanceof KtThisExpression && selector instanceof KtNameReferenceExpression) {
      items.add(m("k", "read", "name", nameOf(selector), "viaThis", true));
    }
  }

  private static Map<String, Object> receiverOf(KtExpression receiver) {
    if (receiver instanceof KtThisExpression) {
      return m("kind", "this");
    }
    if (receiver instanceof KtNameReferenceExpression) {
      return m("kind", "name", "name", nameOf(receiver));
    }
    if (receiver instanceof KtCallExpression
        && "async".equals(nameOf(((KtCallExpression) receiver).getCalleeExpression()))) {
      return m("kind", "async");
    }
    return m("kind", "other");
  }

  private void call(KtCallExpression call, Map<String, Object> receiver) {
    for (ValueArgument argument : call.getValueArguments()) {
      if (argument.getArgumentExpression() != null) {
        walk(argument.getArgumentExpression());
      }
    }
    String name = nameOf(call.getCalleeExpression());
    if (name != null) {
      items.add(m("k", "call", "name", name, "receiver", receiver == null ? m("kind", "none") : receiver));
    }
  }
}
