package nitpicker.kotlinpsi.facts;

import static nitpicker.kotlinpsi.common.Psi.*;

import java.util.*;
import nitpicker.kotlinpsi.common.Frame;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

final class Updates {
  private static final Set<Object> OPERATORS =
      Set.of(KtTokens.EQ, KtTokens.PLUSEQ, KtTokens.MINUSEQ, KtTokens.MULTEQ, KtTokens.DIVEQ, KtTokens.PERCEQ);

  private final State state;

  Updates(State state) {
    this.state = state;
  }

  void assignment(KtBinaryExpression assignment, Frame frame) {
    if (!OPERATORS.contains(assignment.getOperationToken()) || assignment.getRight() == null) {
      return;
    }
    KtExpression left = assignment.getLeft();
    boolean viaThis = false;
    String target = nameOf(left);
    if (left instanceof KtDotQualifiedExpression
        && ((KtDotQualifiedExpression) left).getReceiverExpression() instanceof KtThisExpression) {
      target = nameOf(((KtDotQualifiedExpression) left).getSelectorExpression());
      viaThis = true;
    }
    if (target == null) {
      return;
    }
    Scan scan = new Scan();
    scan.walk(assignment.getRight());
    if (scan.items.stream().noneMatch(item -> "call".equals(((Map<?, ?>) item).get("k")))) {
      return;
    }
    state.updates.add(
        m(
            "line", state.lineOf(assignment.getTextOffset()), "operator", assignment.getOperationReference().getText(),
            "target", target, "viaThis", viaThis, "value", scan.items, "branching", scan.branching,
            "locals", locals(assignment), "scopes", frame == null ? List.of() : frame.chain()));
  }

  private List<Object> locals(PsiElement element) {
    PsiElement scope = PsiTreeUtil.getParentOfType(
        element, KtNamedFunction.class, KtPropertyAccessor.class, KtClassInitializer.class,
        KtSecondaryConstructor.class);
    Set<String> names = new LinkedHashSet<>();
    if (scope != null) {
      for (KtParameter parameter : PsiTreeUtil.findChildrenOfType(scope, KtParameter.class)) {
        names.add(parameter.getName());
      }
      for (KtProperty property : PsiTreeUtil.findChildrenOfType(scope, KtProperty.class)) {
        if (property.isLocal()) {
          names.add(property.getName());
        }
      }
      for (KtDestructuringDeclarationEntry entry :
          PsiTreeUtil.findChildrenOfType(scope, KtDestructuringDeclarationEntry.class)) {
        names.add(entry.getName());
      }
    }
    names.remove(null);
    List<String> sorted = new ArrayList<>(names);
    Collections.sort(sorted);
    return new ArrayList<>(sorted);
  }

  private static final class Scan {
    final List<Object> items = new ArrayList<>();
    boolean branching;

    void walk(PsiElement element) {
      if (element instanceof KtLambdaExpression || element instanceof KtFunction || element instanceof KtClassOrObject) {
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

    private Map<String, Object> receiverOf(KtExpression receiver) {
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
}
