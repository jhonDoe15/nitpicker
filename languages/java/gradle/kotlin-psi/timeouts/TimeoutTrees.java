package nitpicker.kotlinpsi.timeouts;

import static nitpicker.kotlinpsi.common.Psi.*;

import java.util.*;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

final class TimeoutTrees {
  private static final int CHAIN_LIMIT = 16;
  private static final Set<String> STOPS =
      Set.of("cancel", "cancelAndJoin", "cancelChildren", "shutdownNow", "interrupt");

  private TimeoutTrees() {}

  static KtExpression plain(KtExpression expression) {
    return expression == null ? null : KtPsiUtil.safeDeparenthesize(expression);
  }

  static KtExpression receiverOf(KtCallExpression call) {
    PsiElement parent = call.getParent();
    return parent instanceof KtQualifiedExpression qualified && qualified.getSelectorExpression() == call
        ? qualified.getReceiverExpression()
        : null;
  }

  static List<PsiElement> descendants(PsiElement root, boolean nested) {
    List<PsiElement> found = new ArrayList<>();
    if (root == null) {
      return found;
    }
    Deque<PsiElement> pending = new ArrayDeque<>(List.of(root));
    while (!pending.isEmpty()) {
      PsiElement element = pending.pop();
      found.add(element);
      boolean inner = element != root && (element instanceof KtLambdaExpression
          || element instanceof KtNamedFunction || element instanceof KtClassOrObject);
      if (nested || !inner) {
        pending.addAll(Arrays.asList(element.getChildren()));
      }
    }
    return found;
  }

  static String variableName(KtExpression expression) {
    KtExpression bare = plain(expression);
    if (bare instanceof KtDotQualifiedExpression qualified
        && qualified.getReceiverExpression() instanceof KtThisExpression) {
      bare = qualified.getSelectorExpression();
    }
    return bare instanceof KtNameReferenceExpression name ? name.getReferencedName() : null;
  }

  static String simpleName(KtExpression expression) {
    KtExpression bare = plain(expression);
    if (bare instanceof KtQualifiedExpression qualified) {
      bare = qualified.getSelectorExpression();
    }
    return bare instanceof KtCallExpression call ? nameOf(call.getCalleeExpression()) : nameOf(bare);
  }

  static String rootName(KtExpression expression) {
    KtExpression current = plain(expression);
    for (int step = 0; step < CHAIN_LIMIT && current instanceof KtQualifiedExpression qualified; step++) {
      KtExpression receiver = plain(qualified.getReceiverExpression());
      current = receiver instanceof KtThisExpression ? qualified.getSelectorExpression() : receiver;
    }
    return simpleName(current);
  }

  static List<Object> stops(PsiElement body) {
    List<Object> found = new ArrayList<>();
    for (PsiElement element : descendants(body, true)) {
      if (element instanceof KtQualifiedExpression qualified
          && qualified.getSelectorExpression() instanceof KtCallExpression selector
          && STOPS.contains(nameOf(selector.getCalleeExpression()))) {
        List<KtValueArgument> arguments = selector.getValueArguments();
        KtExpression first = arguments.isEmpty() ? null : arguments.get(0).getArgumentExpression();
        found.add(
            m(
                "name", nameOf(selector.getCalleeExpression()),
                "receiver", variableName(qualified.getReceiverExpression()),
                "root", rootName(qualified.getReceiverExpression()), "argument", clip(first)));
      }
    }
    return found;
  }

  static boolean passesName(KtCallExpression call, String name) {
    for (KtValueArgument argument : call.getValueArguments()) {
      if (name != null && name.equals(variableName(argument.getArgumentExpression()))) {
        return true;
      }
    }
    return false;
  }

  static KtExpression chainRoot(KtExpression start) {
    KtExpression current = plain(start);
    for (int step = 0; step < CHAIN_LIMIT; step++) {
      if (!(current instanceof KtQualifiedExpression qualified)) {
        return current;
      }
      KtExpression bare = plain(qualified.getReceiverExpression());
      if (!(bare instanceof KtQualifiedExpression)) {
        return current;
      }
      current = bare;
    }
    return current;
  }

  static KtDeclaration enclosingBody(PsiElement at) {
    for (PsiElement parent = at.getParent(); parent != null; parent = parent.getParent()) {
      if (parent instanceof KtNamedFunction || parent instanceof KtClassInitializer
          || parent instanceof KtPropertyAccessor) {
        return (KtDeclaration) parent;
      }
    }
    return null;
  }

  static KtProperty localProperty(String name, PsiElement at, PsiElement outside) {
    KtDeclaration body = enclosingBody(at);
    if (body == null || name == null) {
      return null;
    }
    int before = at.getTextRange().getStartOffset();
    KtProperty found = null;
    for (PsiElement element : descendants(body, true)) {
      if (element instanceof KtProperty property && property.isLocal() && name.equals(property.getName())
          && property.getTextRange().getEndOffset() <= before
          && (outside == null || !isInside(property, outside))) {
        found = property;
      }
    }
    return found;
  }

  private static boolean isInside(PsiElement element, PsiElement container) {
    return element.getTextRange().getStartOffset() >= container.getTextRange().getStartOffset()
        && element.getTextRange().getEndOffset() <= container.getTextRange().getEndOffset();
  }
}
