package nitpicker.kotlinpsi.facts.lifetimes;

import static nitpicker.kotlinpsi.common.Psi.*;

import java.util.*;
import java.util.function.IntUnaryOperator;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

final class UseBlocks {
  private static final Set<String> JOINING =
      Hosts.names("join", "await", "joinAll", "awaitAll", "cancelAndJoin");
  private static final Set<String> LAUNCHES = Hosts.names("launch", "async");
  private static final Set<String> NESTED_SCOPES =
      Hosts.names("coroutineScope", "supervisorScope", "runBlocking", "withContext", "withTimeout",
          "withTimeoutOrNull");
  private static final Set<String> BUILDERS =
      Hosts.names("launch", "async", "produce", "coroutineScope", "supervisorScope", "runBlocking",
          "withContext", "withTimeout", "withTimeoutOrNull");
  private static final Set<String> TRANSPARENT =
      Hosts.names("let", "also", "forEach", "forEachIndexed", "repeat", "takeIf", "takeUnless", "use",
          "map", "mapNotNull", "filter");
  private static final String SCOPE = "CoroutineScope";

  private record Use(Set<String> names, String implicit, KtLambdaExpression body, Map<String, Object> function) {}

  private final IntUnaryOperator lines;
  final List<Object> launches = new ArrayList<>();

  UseBlocks(IntUnaryOperator lines) {
    this.lines = lines;
  }

  void call(KtCallExpression call, Map<String, Object> function) {
    List<KtLambdaExpression> lambdas = Hosts.lambdas(call);
    if (!"use".equals(nameOf(call.getCalleeExpression())) || lambdas.size() != 1) {
      return;
    }
    KtLambdaExpression body = lambdas.get(0);
    Set<String> names = resourceNames(call, body);
    if (names.isEmpty() || containsJoin(body.getBodyExpression())) {
      return;
    }
    scan(body.getBodyExpression(), new Use(names, implicitScope(call), body, function), false);
  }

  private static Set<String> resourceNames(KtCallExpression call, KtLambdaExpression body) {
    Set<String> names = new LinkedHashSet<>();
    List<KtParameter> parameters = body.getValueParameters();
    if (parameters.isEmpty()) {
      names.add("it");
    } else if (parameters.size() == 1 && parameters.get(0).getDestructuringDeclaration() == null
        && parameters.get(0).getName() != null && !"_".equals(parameters.get(0).getName())) {
      names.add(parameters.get(0).getName());
    }
    if (Hosts.receiverOf(call) instanceof KtNameReferenceExpression) {
      names.add(((KtNameReferenceExpression) Hosts.receiverOf(call)).getReferencedName());
    }
    return names;
  }

  private static boolean containsJoin(PsiElement element) {
    if (element instanceof KtCallExpression
        && JOINING.contains(nameOf(((KtCallExpression) element).getCalleeExpression()))) {
      return true;
    }
    for (PsiElement child : element.getChildren()) {
      if (containsJoin(child)) {
        return true;
      }
    }
    return false;
  }

  private void scan(PsiElement element, Use use, boolean inner) {
    if (element == null || element instanceof KtLambdaExpression || Hosts.isBoundary(element)) {
      return;
    }
    if (!(element instanceof KtCallExpression)) {
      for (PsiElement child : element.getChildren()) {
        scan(child, use, inner);
      }
      return;
    }
    KtCallExpression call = (KtCallExpression) element;
    String name = nameOf(call.getCalleeExpression());
    List<KtLambdaExpression> lambdas = Hosts.lambdas(call);
    if (LAUNCHES.contains(name) && !lambdas.isEmpty()) {
      candidate(call, lambdas.get(lambdas.size() - 1), use, inner);
      return;
    }
    for (ValueArgument argument : call.getValueArguments()) {
      KtExpression expression = Hosts.unwrap(argument.getArgumentExpression());
      if (!(expression instanceof KtLambdaExpression)) {
        scan(expression, use, inner);
      } else if (NESTED_SCOPES.contains(name)) {
        scan(((KtLambdaExpression) expression).getBodyExpression(), use, true);
      } else if (TRANSPARENT.contains(name)) {
        scan(((KtLambdaExpression) expression).getBodyExpression(), use, inner);
      }
    }
  }

  private void candidate(KtCallExpression call, KtLambdaExpression task, Use use, boolean inner) {
    String resource = referenced(task, use.names());
    if (resource == null) {
      return;
    }
    Map<String, Object> fact = m("line", lines.applyAsInt(call.getTextOffset()),
        "launch", nameOf(call.getCalleeExpression()), "resource", resource);
    fact.putAll(use.function());
    KtExpression receiver = Hosts.receiverOf(call);
    if (receiver == null || receiver instanceof KtThisExpression) {
      if (inner || use.implicit() == null) {
        return;
      }
      fact.put("implicit", use.implicit());
    } else if (!explicitScope(receiver, use, fact)) {
      return;
    }
    launches.add(fact);
  }

  private boolean explicitScope(KtExpression receiver, Use use, Map<String, Object> fact) {
    KtExpression subject = receiver instanceof KtQualifiedExpression
        && ((KtQualifiedExpression) receiver).getReceiverExpression() instanceof KtThisExpression
        ? ((KtQualifiedExpression) receiver).getSelectorExpression()
        : receiver;
    if (!(subject instanceof KtNameReferenceExpression)) {
      return false;
    }
    KtNameReferenceExpression reference = (KtNameReferenceExpression) subject;
    Symbols.Declaration declared = Symbols.resolve(reference);
    if (declared != null && within(declared.element(), use.body())) {
      return false;
    }
    fact.put("scope", reference.getReferencedName());
    fact.put("scopeType", declared == null ? null : declared.type());
    return true;
  }

  private static boolean within(PsiElement element, PsiElement container) {
    for (PsiElement current = element; current != null; current = current.getParent()) {
      if (current == container) {
        return true;
      }
    }
    return false;
  }

  private static String referenced(KtLambdaExpression task, Set<String> names) {
    Set<String> found = new LinkedHashSet<>();
    if (!collect(task.getBodyExpression(), names, false, found) || found.isEmpty()) {
      return null;
    }
    return found.iterator().next();
  }

  private static boolean collect(PsiElement element, Set<String> names, boolean nested, Set<String> found) {
    if (element == null) {
      return true;
    }
    if ((element instanceof KtParameter || element instanceof KtProperty
        || element instanceof KtDestructuringDeclarationEntry)
        && names.contains(((KtNamedDeclaration) element).getName())) {
      return false;
    }
    if (element instanceof KtNameReferenceExpression && isValue((KtNameReferenceExpression) element)) {
      String name = ((KtNameReferenceExpression) element).getReferencedName();
      if (names.contains(name) && !(nested && "it".equals(name))) {
        found.add(name);
      }
    }
    boolean inside = nested || element instanceof KtLambdaExpression;
    for (PsiElement child : element.getChildren()) {
      if (!collect(child, names, inside, found)) {
        return false;
      }
    }
    return true;
  }

  private static boolean isValue(KtNameReferenceExpression reference) {
    PsiElement parent = reference.getParent();
    return !(parent instanceof KtValueArgumentName)
        && !(parent instanceof KtQualifiedExpression
            && ((KtQualifiedExpression) parent).getSelectorExpression() == reference);
  }

  private static String implicitScope(KtCallExpression use) {
    for (PsiElement parent = use.getParent(); parent != null; parent = parent.getParent()) {
      if (parent instanceof KtLambdaExpression) {
        String host = Hosts.nameOfHost((KtLambdaExpression) parent);
        if (host != null && BUILDERS.contains(host)) {
          return "builder";
        }
        if (host == null || !TRANSPARENT.contains(host)) {
          return null;
        }
      } else if (parent instanceof KtNamedFunction) {
        return functionScope((KtNamedFunction) parent);
      } else if (Hosts.isBoundary(parent)) {
        return null;
      }
    }
    return null;
  }

  private static String functionScope(KtNamedFunction function) {
    KtTypeReference receiver = function.getReceiverTypeReference();
    if (receiver != null) {
      return SCOPE.equals(receiver.getText().replace("?", "").trim()) ? "extension" : null;
    }
    KtClassOrObject owner = function.isLocal() ? null : Hosts.classOf(function);
    if (owner == null) {
      return null;
    }
    for (KtSuperTypeListEntry entry : owner.getSuperTypeListEntries()) {
      KtTypeReference type = entry.getTypeReference();
      if (type != null && SCOPE.equals(withoutTypeArguments(type.getText()).trim())) {
        return "class";
      }
    }
    return null;
  }
}
