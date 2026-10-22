package nitpicker.kotlinpsi.facts;

import static nitpicker.kotlinpsi.common.Psi.*;

import java.util.*;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

final class Timeouts {
  static final Set<String> BLOCKS = Set.of("withTimeout", "withTimeoutOrNull");
  private static final Set<String> FUTURE_TIMEOUTS = Set.of("orTimeout", "completeOnTimeout");
  private static final Set<String> WAITS = Set.of("await", "join");
  private static final Set<String> CANCELS = Set.of("cancel", "cancelAndJoin", "cancelChildren");
  private static final String TIMEOUT_EXCEPTION = "TimeoutException";
  private static final int CHAIN_LIMIT = 16;

  private final State state;

  Timeouts(State state) {
    this.state = state;
  }

  void call(KtCallExpression call) {
    String name = nameOf(call.getCalleeExpression());
    if (name == null) {
      return;
    }
    String block = state.timeoutBlock(name);
    if (block != null) {
      block(call, name, block);
    } else if (FUTURE_TIMEOUTS.contains(name) && receiverOf(call) != null) {
      futureTimeout(call, name);
    } else if ("get".equals(name) && call.getValueArguments().size() == 2 && receiverOf(call) != null) {
      get(call);
    }
  }

  private static KtExpression receiverOf(KtCallExpression call) {
    PsiElement parent = call.getParent();
    return parent instanceof KtQualifiedExpression
            && ((KtQualifiedExpression) parent).getSelectorExpression() == call
        ? ((KtQualifiedExpression) parent).getReceiverExpression()
        : null;
  }

  private void get(KtCallExpression call) {
    List<Object> handlers = new ArrayList<>();
    List<Object> finallyCalls = new ArrayList<>();
    KtTryExpression owner = timeoutTry(call);
    if (owner == null) {
      return;
    }
    for (KtCatchClause clause : owner.getCatchClauses()) {
      if (catchesTimeout(clause)) {
        handlers.add(
            m("calls", callNames(clause.getCatchBody()), "throws", contains(clause.getCatchBody(), KtThrowExpression.class)));
      }
    }
    if (owner.getFinallyBlock() != null) {
      finallyCalls.addAll(callNames(owner.getFinallyBlock().getFinalExpression()));
    }
    state.timeouts.add(
        m(
            "line", state.lineOf(call.getParent().getTextRange().getStartOffset()), "kind", "get",
            "receiver", clip(receiverOf(call)), "handlers", handlers, "finallyCalls", finallyCalls));
  }

  private static boolean catchesTimeout(KtCatchClause clause) {
    KtParameter parameter = clause.getCatchParameter();
    if (parameter == null || parameter.getTypeReference() == null) {
      return false;
    }
    String type = parameter.getTypeReference().getText();
    return type.equals(TIMEOUT_EXCEPTION) || type.endsWith("." + TIMEOUT_EXCEPTION);
  }

  private static KtTryExpression timeoutTry(PsiElement start) {
    PsiElement child = start;
    for (PsiElement parent = start.getParent(); parent != null; child = parent, parent = parent.getParent()) {
      if (parent instanceof KtNamedFunction || parent instanceof KtFunctionLiteral
          || parent instanceof KtClassOrObject || parent instanceof KtFile) {
        return null;
      }
      if (parent instanceof KtTryExpression && ((KtTryExpression) parent).getTryBlock() == child) {
        for (KtCatchClause clause : ((KtTryExpression) parent).getCatchClauses()) {
          if (catchesTimeout(clause)) {
            return (KtTryExpression) parent;
          }
        }
      }
    }
    return null;
  }

  private static List<Object> callNames(PsiElement root) {
    List<Object> names = new ArrayList<>();
    if (root == null) {
      return names;
    }
    Deque<PsiElement> pending = new ArrayDeque<>(List.of(root));
    while (!pending.isEmpty()) {
      PsiElement element = pending.pop();
      if (element instanceof KtCallExpression) {
        String name = nameOf(((KtCallExpression) element).getCalleeExpression());
        if (name != null) {
          names.add(name);
        }
      }
      pending.addAll(Arrays.asList(element.getChildren()));
    }
    return names;
  }

  private static boolean contains(PsiElement root, Class<? extends PsiElement> type) {
    if (root == null) {
      return false;
    }
    Deque<PsiElement> pending = new ArrayDeque<>(List.of(root));
    while (!pending.isEmpty()) {
      PsiElement element = pending.pop();
      if (type.isInstance(element)) {
        return true;
      }
      pending.addAll(Arrays.asList(element.getChildren()));
    }
    return false;
  }

  private void futureTimeout(KtCallExpression call, String name) {
    Map<String, Object> source = futureSource(receiverOf(call), call);
    state.timeouts.add(
        m(
            "line", state.lineOf(call.getParent().getTextRange().getStartOffset()), "kind", name,
            "receiver", clip(receiverOf(call)), "source", source));
  }

  private Map<String, Object> futureSource(KtExpression start, PsiElement at) {
    KtExpression root = chainRoot(start);
    if (root instanceof KtNameReferenceExpression) {
      KtProperty declared = localProperty(((KtNameReferenceExpression) root).getReferencedName(), at, null);
      if (declared != null && declared.getInitializer() != null) {
        root = chainRoot(declared.getInitializer());
      }
    }
    if (root instanceof KtQualifiedExpression
        && ((KtQualifiedExpression) root).getSelectorExpression() instanceof KtCallExpression) {
      KtQualifiedExpression qualified = (KtQualifiedExpression) root;
      KtCallExpression selector = (KtCallExpression) qualified.getSelectorExpression();
      return m("receiver", clip(qualified.getReceiverExpression()), "name", nameOf(selector.getCalleeExpression()));
    }
    return null;
  }

  private static KtExpression chainRoot(KtExpression start) {
    KtExpression current = KtPsiUtil.safeDeparenthesize(start);
    for (int step = 0; step < CHAIN_LIMIT; step++) {
      if (!(current instanceof KtQualifiedExpression)) {
        return current;
      }
      KtExpression receiver = ((KtQualifiedExpression) current).getReceiverExpression();
      KtExpression plain = KtPsiUtil.safeDeparenthesize(receiver);
      if (!(plain instanceof KtQualifiedExpression)) {
        return current;
      }
      current = plain;
    }
    return current;
  }

  private static KtDeclaration enclosingBody(PsiElement at) {
    for (PsiElement parent = at.getParent(); parent != null; parent = parent.getParent()) {
      if (parent instanceof KtNamedFunction || parent instanceof KtClassInitializer
          || parent instanceof KtPropertyAccessor) {
        return (KtDeclaration) parent;
      }
    }
    return null;
  }

  private static KtProperty localProperty(String name, PsiElement at, PsiElement outside) {
    KtDeclaration body = enclosingBody(at);
    if (body == null) {
      return null;
    }
    int before = at.getTextRange().getStartOffset();
    KtProperty found = null;
    Deque<PsiElement> pending = new ArrayDeque<>(List.of(body));
    while (!pending.isEmpty()) {
      PsiElement element = pending.pop();
      if (element instanceof KtProperty property && property.isLocal() && name.equals(property.getName())
          && property.getTextRange().getEndOffset() <= before
          && (outside == null || !isInside(property, outside))) {
        found = property;
      }
      pending.addAll(Arrays.asList(element.getChildren()));
    }
    return found;
  }

  private static boolean isInside(PsiElement element, PsiElement container) {
    return element.getTextRange().getStartOffset() >= container.getTextRange().getStartOffset()
        && element.getTextRange().getEndOffset() <= container.getTextRange().getEndOffset();
  }

  private void block(KtCallExpression call, String written, String canonical) {
    KtLambdaExpression lambda = lambdaOf(call);
    if (lambda == null) {
      return;
    }
    List<Object> awaited = new ArrayList<>();
    Set<String> seen = new LinkedHashSet<>();
    for (String name : waitedNames(lambda)) {
      KtProperty declared = localProperty(name, call, lambda);
      if (declared != null && seen.add(name)) {
        awaited.add(startedBy(name, declared));
      }
    }
    if (awaited.isEmpty()) {
      return;
    }
    state.timeouts.add(
        m(
            "line", state.lineOf(call.getTextRange().getStartOffset()), "kind", canonical, "name", written,
            "awaited", awaited, "cancelled", cancelledNames(enclosingBody(call))));
  }

  private static KtLambdaExpression lambdaOf(KtCallExpression call) {
    for (KtLambdaArgument argument : call.getLambdaArguments()) {
      return argument.getLambdaExpression();
    }
    for (ValueArgument argument : call.getValueArguments()) {
      if (argument.getArgumentExpression() instanceof KtLambdaExpression lambda) {
        return lambda;
      }
    }
    return null;
  }

  private static List<String> waitedNames(KtLambdaExpression lambda) {
    List<String> names = new ArrayList<>();
    Deque<PsiElement> pending = new ArrayDeque<>(List.of(lambda));
    while (!pending.isEmpty()) {
      PsiElement element = pending.pop();
      if (element instanceof KtDotQualifiedExpression qualified
          && qualified.getSelectorExpression() instanceof KtCallExpression selector
          && WAITS.contains(nameOf(selector.getCalleeExpression()))
          && qualified.getReceiverExpression() instanceof KtNameReferenceExpression receiver) {
        names.add(receiver.getReferencedName());
      }
      pending.addAll(Arrays.asList(element.getChildren()));
    }
    return names;
  }

  private static Map<String, Object> startedBy(String name, KtProperty declared) {
    KtExpression initializer = declared.getInitializer();
    String scope = null;
    String starter = null;
    if (initializer instanceof KtQualifiedExpression qualified
        && qualified.getSelectorExpression() instanceof KtCallExpression selector) {
      scope = clip(qualified.getReceiverExpression());
      starter = nameOf(selector.getCalleeExpression());
    } else if (initializer instanceof KtCallExpression direct) {
      starter = nameOf(direct.getCalleeExpression());
    }
    return m("name", name, "scope", scope, "starter", starter);
  }

  private static List<Object> cancelledNames(KtDeclaration body) {
    List<Object> names = new ArrayList<>();
    if (body == null) {
      return names;
    }
    Deque<PsiElement> pending = new ArrayDeque<>(List.of(body));
    while (!pending.isEmpty()) {
      PsiElement element = pending.pop();
      if (element instanceof KtDotQualifiedExpression qualified
          && qualified.getSelectorExpression() instanceof KtCallExpression selector
          && CANCELS.contains(nameOf(selector.getCalleeExpression()))) {
        names.add(clip(qualified.getReceiverExpression()));
      }
      pending.addAll(Arrays.asList(element.getChildren()));
    }
    return names;
  }
}
