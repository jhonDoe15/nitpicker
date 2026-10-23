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
          "getOrPut");

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

  private KtExpression climb(KtExpression value) {
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

  private String changeOf(KtExpression value) {
    KtExpression top = climb(value);
    PsiElement parent = top.getParent();
    if (parent instanceof KtQualifiedExpression && ((KtQualifiedExpression) parent).getReceiverExpression() == top
        && ((KtQualifiedExpression) parent).getSelectorExpression() instanceof KtCallExpression) {
      KtCallExpression call = (KtCallExpression) ((KtQualifiedExpression) parent).getSelectorExpression();
      String name = Ps.name(call);
      return name != null && MUTATORS.contains(name) && ctx.calls.target(call) == null ? name : null;
    }
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
    return null;
  }
}
