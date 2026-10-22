package nitpicker.kotlinpsi.design;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.psi.*;

final class ReturnsField {
  private ReturnsField() {}

  static String of(Ctx ctx, Fun function) {
    if (function.returnsField != null) {
      return function.returnsField;
    }
    if (function.constructor() || function.roots.isEmpty()) {
      return null;
    }
    Set<String> names = new LinkedHashSet<>();
    for (KtExpression returned : returned(function)) {
      String name = fieldName(ctx, function, returned);
      if (name != null) {
        names.add(name);
      }
    }
    return names.size() == 1 ? names.iterator().next() : null;
  }

  private static List<KtExpression> returned(Fun function) {
    List<KtExpression> expressions = new ArrayList<>();
    for (PsiElement root : function.roots) {
      if (!(root instanceof KtBlockExpression)) {
        expressions.add((KtExpression) root);
        continue;
      }
      for (KtReturnExpression statement : PsiTreeUtil.findChildrenOfType(root, KtReturnExpression.class)) {
        if (statement.getReturnedExpression() != null && statement.getLabeledExpression() == null
            && PsiTreeUtil.getParentOfType(statement, KtFunctionLiteral.class, KtNamedFunction.class) == function.psi) {
          expressions.add(statement.getReturnedExpression());
        } else if (statement.getReturnedExpression() != null && statement.getLabeledExpression() == null
            && PsiTreeUtil.getParentOfType(statement, KtFunctionLiteral.class, KtNamedFunction.class) == null) {
          expressions.add(statement.getReturnedExpression());
        }
      }
    }
    return expressions;
  }

  private static String fieldName(Ctx ctx, Fun function, KtExpression returned) {
    KtExpression e = Ps.strip(returned);
    Prop prop = null;
    if (e instanceof KtNameReferenceExpression) {
      Binding binding = ctx.bindings.bind((KtNameReferenceExpression) e);
      prop = binding.kind == Binding.Kind.FIELD && !binding.receiver ? binding.prop : null;
    } else if (e instanceof KtDotQualifiedExpression
        && Ps.strip(((KtDotQualifiedExpression) e).getReceiverExpression()) instanceof KtThisExpression
        && ((KtDotQualifiedExpression) e).getSelectorExpression() instanceof KtNameReferenceExpression) {
      String name = ((KtNameReferenceExpression) ((KtDotQualifiedExpression) e).getSelectorExpression()).getReferencedName();
      prop = function.owner.module() ? null : ctx.members.prop(function.owner, name);
    }
    return prop != null && prop.owner == function.owner && prop.field ? prop.name : null;
  }
}
