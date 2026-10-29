package nitpicker.kotlinpsi.design.judge;

import nitpicker.kotlinpsi.design.Ctx;
import nitpicker.kotlinpsi.design.model.Prop;
import nitpicker.kotlinpsi.design.resolve.Binding;
import nitpicker.kotlinpsi.design.syntax.Mutables;
import nitpicker.kotlinpsi.design.syntax.Ps;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

public final class Owned {
  private Owned() {}

  public static boolean created(Prop prop) {
    if (prop.delegated) {
      KtExpression delegate = prop.psi instanceof KtProperty ? ((KtProperty) prop.psi).getDelegateExpression() : null;
      return Mutables.lazyCreated(prop.owner.source, delegate);
    }
    return Mutables.created(prop.owner.source, prop.init);
  }

  public static boolean mutable(Ctx ctx, Prop prop) {
    if (!prop.field || !created(prop)) {
      return false;
    }
    return !prop.isVar || onlyMutableAssigned(ctx, prop);
  }

  private static boolean onlyMutableAssigned(Ctx ctx, Prop prop) {
    PsiElement scope = prop.owner.module() ? prop.owner.source.psi : prop.owner.psi;
    for (KtBinaryExpression assignment : PsiTreeUtil.findChildrenOfType(scope, KtBinaryExpression.class)) {
      if (assigns(ctx, assignment, prop) && !replacesWithMutable(assignment, prop)) {
        return false;
      }
    }
    return true;
  }

  private static boolean replacesWithMutable(KtBinaryExpression assignment, Prop prop) {
    return assignment.getOperationToken() == KtTokens.EQ
        && Mutables.created(prop.owner.source, assignment.getRight());
  }

  private static boolean assigns(Ctx ctx, KtBinaryExpression expression, Prop prop) {
    if (!Ps.assignment(expression)) {
      return false;
    }
    KtExpression left = Ps.parens(expression.getLeft());
    if (left instanceof KtNameReferenceExpression) {
      Binding binding = ctx.bindings.bind((KtNameReferenceExpression) left);
      return binding.kind == Binding.Kind.FIELD && !binding.receiver && binding.prop == prop;
    }
    return left instanceof KtDotQualifiedExpression && onThis((KtDotQualifiedExpression) left, prop);
  }

  private static boolean onThis(KtDotQualifiedExpression dot, Prop prop) {
    KtExpression selector = dot.getSelectorExpression();
    return Ps.parens(dot.getReceiverExpression()) instanceof KtThisExpression
        && selector instanceof KtNameReferenceExpression
        && prop.name.equals(((KtNameReferenceExpression) selector).getReferencedName());
  }
}
