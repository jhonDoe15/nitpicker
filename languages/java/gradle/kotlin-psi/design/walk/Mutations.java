package nitpicker.kotlinpsi.design.walk;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import nitpicker.kotlinpsi.design.Ctx;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.resolve.Binding;
import nitpicker.kotlinpsi.design.syntax.Ps;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

public final class Mutations {
  private static final Set<String> MUTATORS =
      Set.of(
          "add", "addAll", "addFirst", "addLast", "remove", "removeAll", "removeAt", "removeFirst", "removeLast",
          "removeIf", "retainAll", "clear", "put", "putAll", "putIfAbsent", "set", "sort", "sortBy",
          "sortByDescending", "sortWith", "sortDescending", "shuffle", "reverse", "fill", "replaceAll", "compute",
          "computeIfAbsent", "computeIfPresent", "merge", "push", "pop", "poll", "offer", "append", "insert",
          "getOrPut", "appendLine", "appendRange", "appendCodePoint", "insertRange", "delete", "deleteCharAt",
          "replace", "setLength", "setCharAt", "removeFirstOrNull", "removeLastOrNull");
  private static final Set<String> COLLECTIONS =
      Set.of("sort", "shuffle", "reverse", "fill", "swap", "rotate", "addAll", "replaceAll", "copy");
  private static final Set<String> KEEPS_VALUE = Set.of("also", "apply");
  private static final Set<String> TAKES_VALUE = Set.of("also", "let");
  private static final Set<String> SCOPES = Set.of("also", "apply", "let", "run");
  private static final int HOPS = 8;

  private final Ctx ctx;
  private final Fun function;

  public Mutations(Ctx ctx, Fun function) {
    this.ctx = ctx;
    this.function = function;
  }

  public String of(KtExpression value) {
    String direct = changeOf(value);
    if (direct != null) {
      return direct;
    }
    KtExpression top = climb(value);
    PsiElement parent = top.getParent();
    if (parent instanceof KtProperty && ((KtProperty) parent).getInitializer() == top
        && ((KtProperty) parent).isLocal() && ((KtProperty) parent).getName() != null) {
      KtProperty local = (KtProperty) parent;
      return local.isVar() && reassigned(local) ? null : firstChange(local);
    }
    return null;
  }

  public boolean reassigned(KtProperty local) {
    for (KtNameReferenceExpression ref : references(local)) {
      PsiElement parent = parentSkippingParens(ref);
      if (parent instanceof KtBinaryExpression && Ps.assignment((KtBinaryExpression) parent)
          && Ps.parens(((KtBinaryExpression) parent).getLeft()) == ref) {
        return true;
      }
      if (parent instanceof KtUnaryExpression && isCount(((KtUnaryExpression) parent).getOperationToken())) {
        return true;
      }
    }
    return false;
  }

  private boolean isCount(Object token) {
    return token == KtTokens.PLUSPLUS || token == KtTokens.MINUSMINUS;
  }

  private String firstChange(KtProperty local) {
    for (KtNameReferenceExpression ref : references(local)) {
      String change = ref.getTextOffset() > local.getTextOffset() ? changeOf(ref) : null;
      if (change != null) {
        return change;
      }
    }
    return null;
  }

  private List<KtNameReferenceExpression> references(KtProperty local) {
    List<KtNameReferenceExpression> found = new ArrayList<>();
    for (PsiElement root : function.roots) {
      found.addAll(referencesIn(root, local));
    }
    return found;
  }

  private List<KtNameReferenceExpression> referencesIn(PsiElement root, KtProperty local) {
    List<KtNameReferenceExpression> found = new ArrayList<>();
    for (KtNameReferenceExpression ref : PsiTreeUtil.findChildrenOfType(root, KtNameReferenceExpression.class)) {
      if (refersTo(ref, local)) {
        found.add(ref);
      }
    }
    return found;
  }

  private boolean refersTo(KtNameReferenceExpression ref, KtProperty local) {
    if (!local.getName().equals(ref.getReferencedName()) || !plainReference(ref)) {
      return false;
    }
    Binding binding = ctx.bindings.bind(ref);
    return binding.kind == Binding.Kind.LOCAL && binding.declaration == local;
  }

  private boolean plainReference(KtNameReferenceExpression ref) {
    PsiElement parent = ref.getParent();
    boolean selector =
        parent instanceof KtQualifiedExpression && ((KtQualifiedExpression) parent).getSelectorExpression() == ref;
    return !(parent instanceof KtCallExpression) && !selector && !(parent instanceof KtUserType);
  }

  private PsiElement parentSkippingParens(KtExpression expression) {
    PsiElement parent = expression.getParent();
    while (parent instanceof KtParenthesizedExpression) {
      parent = parent.getParent();
    }
    return parent;
  }

  private KtExpression wrapped(KtExpression value) {
    KtExpression current = value;
    while (true) {
      PsiElement parent = current.getParent();
      boolean wrapper = parent instanceof KtParenthesizedExpression
          || parent instanceof KtPostfixExpression
              && ((KtPostfixExpression) parent).getOperationToken() == KtTokens.EXCLEXCL
          || parent instanceof KtBinaryExpressionWithTypeRHS
              && ((KtBinaryExpressionWithTypeRHS) parent).getLeft() == current;
      if (!wrapper) {
        return current;
      }
      current = (KtExpression) parent;
    }
  }

  private KtExpression climb(KtExpression value) {
    KtExpression current = wrapped(value);
    for (int hop = 0; hop < HOPS; hop++) {
      KtCallExpression scope = scopeOn(current);
      if (scope == null || !KEEPS_VALUE.contains(Ps.name(scope))) {
        return current;
      }
      current = wrapped((KtExpression) scope.getParent());
    }
    return current;
  }

  private KtCallExpression scopeOn(KtExpression current) {
    PsiElement parent = current.getParent();
    boolean receiver = parent instanceof KtQualifiedExpression
        && ((KtQualifiedExpression) parent).getReceiverExpression() == current;
    if (!receiver) {
      return null;
    }
    KtExpression selector = ((KtQualifiedExpression) parent).getSelectorExpression();
    String name = selector instanceof KtCallExpression ? Ps.name((KtCallExpression) selector) : null;
    return name != null && SCOPES.contains(name) ? (KtCallExpression) selector : null;
  }

  private String scopedChange(KtExpression value) {
    KtExpression current = wrapped(value);
    KtCallExpression with = withOn(current);
    if (with != null) {
      return lambdaChange(with);
    }
    for (int hop = 0; hop < HOPS; hop++) {
      KtCallExpression scope = scopeOn(current);
      if (scope == null) {
        return null;
      }
      String change = lambdaChange(scope);
      if (change != null || !KEEPS_VALUE.contains(Ps.name(scope))) {
        return change;
      }
      current = wrapped((KtExpression) scope.getParent());
    }
    return null;
  }

  private KtCallExpression withOn(KtExpression current) {
    PsiElement list = current.getParent() instanceof KtValueArgument ? current.getParent().getParent() : null;
    PsiElement call = list == null ? null : list.getParent();
    boolean with = call instanceof KtCallExpression && "with".equals(Ps.name((KtCallExpression) call));
    return with && ((KtCallExpression) call).getValueArguments().get(0).getArgumentExpression() == current
        ? (KtCallExpression) call
        : null;
  }

  private String lambdaChange(KtCallExpression scope) {
    List<KtLambdaArgument> lambdas = scope.getLambdaArguments();
    KtLambdaExpression lambda = lambdas.isEmpty() ? null : lambdas.get(0).getLambdaExpression();
    if (lambda == null) {
      return null;
    }
    String param = receiverName(Ps.name(scope), lambda);
    for (KtCallExpression call : PsiTreeUtil.findChildrenOfType(lambda, KtCallExpression.class)) {
      String name = Ps.name(call);
      if (name != null && MUTATORS.contains(name) && onScoped(call, param) && ctx.calls.target(call) == null) {
        return name;
      }
    }
    return null;
  }

  private String receiverName(String scope, KtLambdaExpression lambda) {
    if (!TAKES_VALUE.contains(scope)) {
      return null;
    }
    List<KtParameter> parameters = lambda.getValueParameters();
    return parameters.isEmpty() ? "it" : parameters.get(0).getName();
  }

  private boolean onScoped(KtCallExpression call, String param) {
    KtExpression receiver = Ps.receiverOf(call);
    if (param == null) {
      return receiver == null || receiver instanceof KtThisExpression;
    }
    return receiver instanceof KtNameReferenceExpression
        && param.equals(((KtNameReferenceExpression) receiver).getReferencedName());
  }

  private String collectionsChange(KtExpression top) {
    PsiElement list = top.getParent() instanceof KtValueArgument ? top.getParent().getParent() : null;
    PsiElement parent = list == null ? null : list.getParent();
    if (!(parent instanceof KtCallExpression)) {
      return null;
    }
    KtCallExpression call = (KtCallExpression) parent;
    String name = Ps.name(call);
    List<KtValueArgument> values = call.getValueArguments();
    boolean first = !values.isEmpty() && values.get(0).getArgumentExpression() == top;
    return first && name != null && COLLECTIONS.contains(name) && fromCollections(call, name) ? name : null;
  }

  private boolean fromCollections(KtCallExpression call, String name) {
    KtExpression receiver = Ps.receiverOf(call);
    if (receiver == null) {
      String imported = ctx.sourceOf(call).imports.get(name);
      return imported != null && imported.startsWith("java.util.Collections.");
    }
    return receiver.getText().equals("Collections") || receiver.getText().equals("java.util.Collections");
  }

  private String changeOf(KtExpression value) {
    String scoped = scopedChange(value);
    if (scoped != null) {
      return scoped;
    }
    KtExpression top = climb(value);
    PsiElement parent = top.getParent();
    if (parent instanceof KtQualifiedExpression && ((KtQualifiedExpression) parent).getReceiverExpression() == top
        && ((KtQualifiedExpression) parent).getSelectorExpression() instanceof KtCallExpression) {
      KtCallExpression call = (KtCallExpression) ((KtQualifiedExpression) parent).getSelectorExpression();
      String name = Ps.name(call);
      return name != null && MUTATORS.contains(name) && ctx.calls.target(call) == null ? name : null;
    }
    return indexedChange(top, parent);
  }

  private String indexedChange(KtExpression top, PsiElement parent) {
    if (parent instanceof KtArrayAccessExpression && ((KtArrayAccessExpression) parent).getArrayExpression() == top) {
      PsiElement outer = parent.getParent();
      boolean target = outer instanceof KtBinaryExpression && Ps.assignment((KtBinaryExpression) outer)
          && ((KtBinaryExpression) outer).getLeft() == parent;
      return target ? "assign" : null;
    }
    if (parent instanceof KtBinaryExpression && ((KtBinaryExpression) parent).getLeft() == top) {
      Object token = ((KtBinaryExpression) parent).getOperationToken();
      return token == KtTokens.PLUSEQ ? "plusAssign" : token == KtTokens.MINUSEQ ? "minusAssign" : null;
    }
    return collectionsChange(top);
  }
}
