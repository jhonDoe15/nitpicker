package nitpicker.kotlinpsi.coroutines;

import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.jetbrains.kotlin.psi.*;

final class Contexts {
  enum Kind { OFFLOADED, SHARED, NONE }

  private static final Set<String> SHARED_DISPATCHERS = Set.of("Default", "Main", "Unconfined");
  private static final Set<String> DISPATCHER_SUFFIXES = Set.of("immediate", "limitedParallelism");
  private static final Set<String> ELEMENT_NAMES = Set.of("NonCancellable", "EmptyCoroutineContext");
  private static final Set<String> ELEMENT_CALLS =
      Set.of("CoroutineName", "Job", "SupervisorJob", "CoroutineExceptionHandler");
  private static final Set<String> ELEMENT_TYPES =
      Set.of("Job", "CompletableJob", "CoroutineName", "CoroutineExceptionHandler", "NonCancellable");

  private Contexts() {}

  static Kind of(KtExpression context) {
    List<KtExpression> elements = new ArrayList<>();
    flatten(context, elements);
    for (int index = elements.size() - 1; index >= 0; index--) {
      Kind kind = element(elements.get(index));
      if (kind != Kind.NONE) {
        return kind;
      }
    }
    return Kind.NONE;
  }

  private static void flatten(KtExpression expression, List<KtExpression> elements) {
    KtExpression target = expression == null ? null : KtPsiUtil.safeDeparenthesize(expression);
    if (target == null) {
      return;
    }
    if (target instanceof KtBinaryExpression binary && "+".equals(binary.getOperationReference().getReferencedName())) {
      flatten(binary.getLeft(), elements);
      flatten(binary.getRight(), elements);
    } else {
      elements.add(target);
    }
  }

  private static Kind element(KtExpression element) {
    String dispatcher = dispatchersMember(element);
    if (dispatcher != null) {
      return SHARED_DISPATCHERS.contains(dispatcher) ? Kind.SHARED : Kind.OFFLOADED;
    }
    if (element instanceof KtNameReferenceExpression name && ELEMENT_NAMES.contains(name.getReferencedName())) {
      return Kind.NONE;
    }
    if (element instanceof KtCallExpression call && ELEMENT_CALLS.contains(nameOf(call.getCalleeExpression()))) {
      return Kind.NONE;
    }
    String type = ReceiverTypes.of(element);
    String simple = type == null ? null : type.substring(type.lastIndexOf('.') + 1);
    return simple != null && ELEMENT_TYPES.contains(simple) ? Kind.NONE : Kind.OFFLOADED;
  }

  private static String dispatchersMember(KtExpression element) {
    KtExpression current = element;
    while (current instanceof KtDotQualifiedExpression dotted && DISPATCHER_SUFFIXES.contains(selectorName(dotted))
        && !(dotted.getReceiverExpression() instanceof KtNameReferenceExpression)) {
      current = dotted.getReceiverExpression();
    }
    if (current instanceof KtDotQualifiedExpression dotted
        && dotted.getReceiverExpression() instanceof KtNameReferenceExpression owner
        && "Dispatchers".equals(owner.getReferencedName())) {
      return selectorName(dotted);
    }
    return null;
  }

  private static String selectorName(KtDotQualifiedExpression dotted) {
    KtExpression selector = dotted.getSelectorExpression();
    return selector instanceof KtCallExpression call ? nameOf(call.getCalleeExpression()) : nameOf(selector);
  }
}
