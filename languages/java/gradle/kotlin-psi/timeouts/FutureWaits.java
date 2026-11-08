package nitpicker.kotlinpsi.timeouts;

import static nitpicker.kotlinpsi.common.Psi.*;
import static nitpicker.kotlinpsi.timeouts.TimeoutTrees.*;

import java.util.*;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

final class FutureWaits {
  private static final String TIMEOUT_EXCEPTION = "TimeoutException";

  private FutureWaits() {}

  static Map<String, Object> get(KtCallExpression call) {
    KtTryExpression owner = timeoutTry(call);
    if (owner == null) {
      return null;
    }
    KtExpression receiver = receiverOf(call);
    String variable = variableName(receiver);
    KtDeclaration body = enclosingBody(call);
    KtProperty declared = variable == null ? null : localProperty(variable, call, null);
    KtExpression origin = variable == null ? receiver : declared == null ? null : declared.getInitializer();
    List<Object> handlers = new ArrayList<>();
    for (KtCatchClause clause : owner.getCatchClauses()) {
      if (catchesTimeout(clause)) {
        handlers.add(
            m("throws", throwsIn(clause.getCatchBody()), "passes", passes(clause.getCatchBody(), variable)));
      }
    }
    return m(
        "kind", "get", "receiver", clip(receiver), "variable", variable, "name", simpleName(receiver),
        "unit", unit(call.getValueArguments().get(1).getArgumentExpression()),
        "source", futureSource(receiver, call), "visible", origin != null,
        "executors", executors(origin, body, variable), "threads", threads(body, variable),
        "handlers", handlers, "stops", stops(body));
  }

  static Map<String, Object> futureTimeout(KtCallExpression call, String name) {
    KtExpression receiver = receiverOf(call);
    return m(
        "kind", name, "receiver", clip(receiver), "name", simpleName(receiver),
        "source", futureSource(receiver, call));
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
      if (parent instanceof KtTryExpression attempt && attempt.getTryBlock() == child) {
        for (KtCatchClause clause : attempt.getCatchClauses()) {
          if (catchesTimeout(clause)) {
            return attempt;
          }
        }
      }
    }
    return null;
  }

  private static boolean throwsIn(PsiElement handler) {
    return descendants(handler, false).stream().anyMatch(KtThrowExpression.class::isInstance);
  }

  private static List<Object> passes(PsiElement handler, String variable) {
    List<Object> names = new ArrayList<>();
    for (PsiElement element : descendants(handler, true)) {
      if (element instanceof KtCallExpression call && passesName(call, variable)) {
        names.add(nameOf(call.getCalleeExpression()));
      }
    }
    return names;
  }

  private static Map<String, Object> unit(KtExpression argument) {
    KtExpression bare = plain(argument);
    if (bare instanceof KtDotQualifiedExpression qualified
        && qualified.getSelectorExpression() instanceof KtNameReferenceExpression name) {
      return m("qualifier", clip(qualified.getReceiverExpression()), "name", name.getReferencedName());
    }
    return bare instanceof KtNameReferenceExpression name
        ? m("qualifier", null, "name", name.getReferencedName())
        : null;
  }

  private static List<Object> executors(KtExpression origin, PsiElement body, String variable) {
    List<Object> names = new ArrayList<>();
    if (plain(origin) instanceof KtDotQualifiedExpression qualified
        && qualified.getSelectorExpression() instanceof KtCallExpression) {
      names.add(variableName(qualified.getReceiverExpression()));
    }
    for (PsiElement element : descendants(body, true)) {
      if (element instanceof KtDotQualifiedExpression qualified
          && qualified.getSelectorExpression() instanceof KtCallExpression selector
          && passesName(selector, variable)) {
        names.add(variableName(qualified.getReceiverExpression()));
      }
    }
    names.removeIf(Objects::isNull);
    return names;
  }

  private static List<Object> threads(PsiElement body, String variable) {
    List<Object> names = new ArrayList<>();
    for (PsiElement element : descendants(body, true)) {
      if (element instanceof KtProperty property && property.isLocal()
          && property.getInitializer() instanceof KtCallExpression created
          && "Thread".equals(nameOf(created.getCalleeExpression())) && passesName(created, variable)) {
        names.add(property.getName());
      }
    }
    return names;
  }

  private static Map<String, Object> futureSource(KtExpression start, PsiElement at) {
    KtExpression root = chainRoot(start);
    if (root instanceof KtNameReferenceExpression reference) {
      KtProperty declared = localProperty(reference.getReferencedName(), at, null);
      if (declared != null && declared.getInitializer() != null) {
        root = chainRoot(declared.getInitializer());
      }
    }
    if (root instanceof KtQualifiedExpression qualified
        && qualified.getSelectorExpression() instanceof KtCallExpression selector) {
      List<KtValueArgument> arguments = selector.getValueArguments();
      String executor = arguments.size() < 2 ? null : variableName(arguments.get(1).getArgumentExpression());
      return m(
          "receiver", clip(qualified.getReceiverExpression()), "name", nameOf(selector.getCalleeExpression()),
          "executor", executor);
    }
    return null;
  }
}
