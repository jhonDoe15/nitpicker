package nitpicker.kotlinpsi.load;

import static nitpicker.kotlinpsi.common.Psi.*;

import java.util.*;
import java.util.function.IntUnaryOperator;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

public final class LoadCalls {
  private final LoadTime time;
  private final IntUnaryOperator lineOf;
  private final List<Object> loads = new ArrayList<>();
  private final List<Object> bindings = new ArrayList<>();

  public LoadCalls(KtFile file, IntUnaryOperator lineOf) {
    this.time = new LoadTime(file);
    this.lineOf = lineOf;
  }

  public void observe(PsiElement element) {
    if (element instanceof KtCallExpression) {
      call((KtCallExpression) element);
    } else if (element instanceof KtQualifiedExpression) {
      access((KtQualifiedExpression) element);
    } else if (element instanceof KtProperty) {
      binding((KtProperty) element);
    }
  }

  public Map<String, Object> result() {
    return m("loads", loads, "bindings", bindings);
  }

  private void call(KtCallExpression call) {
    String name = nameOf(call.getCalleeExpression());
    Map<String, Object> context = name == null ? null : time.contextOf(call);
    if (context == null) {
      return;
    }
    PsiElement top = call;
    List<Object> receiver = List.of();
    if (call.getParent() instanceof KtQualifiedExpression
        && ((KtQualifiedExpression) call.getParent()).getSelectorExpression() == call) {
      top = call.getParent();
      receiver = chain(((KtQualifiedExpression) top).getReceiverExpression());
    }
    record(top, m("name", name, "call", true, "receiver", receiver, "arguments", arguments(call)), context);
  }

  private void access(KtQualifiedExpression access) {
    if (!(access.getSelectorExpression() instanceof KtNameReferenceExpression)) {
      return;
    }
    Map<String, Object> context = time.contextOf(access);
    if (context != null) {
      String name = nameOf(access.getSelectorExpression());
      record(access, m("name", name, "call", false, "receiver", chain(access.getReceiverExpression())), context);
    }
  }

  private void record(PsiElement top, Map<String, Object> item, Map<String, Object> context) {
    item.put("line", lineOf.applyAsInt(top.getTextRange().getStartOffset()));
    item.put("text", clip(top));
    item.put("context", context);
    loads.add(item);
  }

  private void binding(KtProperty property) {
    KtExpression initializer = property.getInitializer();
    if (property.getName() == null || (property.getTypeReference() == null && initializer == null)
        || (property.isLocal() && time.contextOf(property) == null)) {
      return;
    }
    bindings.add(
        m(
            "name", property.getName(), "owner", LoadTime.ownerOf(property), "local", property.isLocal(),
            "type", clip(property.getTypeReference()),
            "init", initializer == null ? null : chain(initializer)));
  }

  static List<Object> chain(KtExpression expression) {
    LinkedList<Object> segments = new LinkedList<>();
    KtExpression current = KtPsiUtil.safeDeparenthesize(expression);
    while (current instanceof KtQualifiedExpression) {
      segments.addFirst(segment(((KtQualifiedExpression) current).getSelectorExpression()));
      current = KtPsiUtil.safeDeparenthesize(((KtQualifiedExpression) current).getReceiverExpression());
    }
    if (!(current instanceof KtThisExpression && ((KtThisExpression) current).getLabelName() == null)) {
      segments.addFirst(segment(current));
    }
    return segments;
  }

  private static Map<String, Object> segment(KtExpression expression) {
    if (expression instanceof KtCallExpression) {
      KtCallExpression call = (KtCallExpression) expression;
      String name = nameOf(call.getCalleeExpression());
      return name == null ? m("opaque", true) : m("name", name, "call", true, "arguments", arguments(call));
    }
    if (expression instanceof KtNameReferenceExpression) {
      return m("name", nameOf(expression), "call", false);
    }
    return m("opaque", true);
  }
}
