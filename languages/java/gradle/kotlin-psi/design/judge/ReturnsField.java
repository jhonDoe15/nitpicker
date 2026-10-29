package nitpicker.kotlinpsi.design.judge;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import nitpicker.kotlinpsi.design.Ctx;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.model.Prop;
import nitpicker.kotlinpsi.design.resolve.Binding;
import nitpicker.kotlinpsi.design.syntax.Ps;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.psi.*;

public final class ReturnsField {
  private static final Set<String> SCOPED = Set.of("synchronized", "withLock", "run", "let");

  private ReturnsField() {}

  public static String of(Ctx ctx, Fun function) {
    if (function.returnsField != null) {
      return function.returnsField;
    }
    if (function.constructor() || function.roots.isEmpty()) {
      return null;
    }
    Set<String> names = new LinkedHashSet<>();
    for (KtExpression returned : leaves(returned(function))) {
      String name = fieldName(ctx, function, returned);
      if (name != null) {
        names.add(name);
      }
    }
    return names.size() == 1 ? names.iterator().next() : null;
  }

  private static List<KtExpression> leaves(List<KtExpression> returned) {
    List<KtExpression> leaves = new ArrayList<>();
    Deque<KtExpression> pending = new ArrayDeque<>(returned);
    while (!pending.isEmpty()) {
      KtExpression expression = Ps.strip(pending.pop());
      List<KtExpression> inner = expression == null ? List.of() : branches(expression);
      if (inner == null) {
        leaves.add(expression);
      } else {
        pending.addAll(inner);
      }
    }
    return leaves;
  }

  private static List<KtExpression> branches(KtExpression expression) {
    List<KtExpression> inner = new ArrayList<>();
    if (expression instanceof KtIfExpression) {
      inner.add(((KtIfExpression) expression).getThen());
      inner.add(((KtIfExpression) expression).getElse());
    } else if (expression instanceof KtWhenExpression) {
      for (KtWhenEntry entry : ((KtWhenExpression) expression).getEntries()) {
        inner.add(entry.getExpression());
      }
    } else if (expression instanceof KtBlockExpression) {
      inner.add(lastOf(((KtBlockExpression) expression).getStatements()));
    } else if (scoped(expression)) {
      inner.add(lambdaResult((KtCallExpression) expression));
    } else {
      return null;
    }
    inner.removeIf(Objects::isNull);
    return inner;
  }

  private static boolean scoped(KtExpression expression) {
    String name = expression instanceof KtCallExpression ? Ps.name((KtCallExpression) expression) : null;
    return name != null && SCOPED.contains(name);
  }

  private static KtExpression lambdaResult(KtCallExpression call) {
    List<KtLambdaArgument> lambdas = call.getLambdaArguments();
    KtLambdaExpression lambda = lambdas.isEmpty() ? null : lambdas.get(0).getLambdaExpression();
    KtBlockExpression body = lambda == null ? null : lambda.getBodyExpression();
    return body == null ? null : lastOf(body.getStatements());
  }

  private static KtExpression lastOf(List<KtExpression> statements) {
    return statements.isEmpty() ? null : statements.get(statements.size() - 1);
  }

  private static List<KtExpression> returned(Fun function) {
    List<KtExpression> expressions = new ArrayList<>();
    for (PsiElement root : function.roots) {
      if (root instanceof KtBlockExpression) {
        expressions.addAll(returns(function, root));
      } else {
        expressions.add((KtExpression) root);
      }
    }
    return expressions;
  }

  private static List<KtExpression> returns(Fun function, PsiElement block) {
    List<KtExpression> expressions = new ArrayList<>();
    for (KtReturnExpression statement : PsiTreeUtil.findChildrenOfType(block, KtReturnExpression.class)) {
      if (ownReturn(function, statement)) {
        expressions.add(statement.getReturnedExpression());
      }
    }
    return expressions;
  }

  private static boolean ownReturn(Fun function, KtReturnExpression statement) {
    if (statement.getReturnedExpression() == null || statement.getLabeledExpression() != null) {
      return false;
    }
    PsiElement host = PsiTreeUtil.getParentOfType(statement, KtFunctionLiteral.class, KtNamedFunction.class);
    return host == function.psi || host == null;
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
      KtExpression selector = ((KtDotQualifiedExpression) e).getSelectorExpression();
      String name = ((KtNameReferenceExpression) selector).getReferencedName();
      prop = function.owner.module() ? null : ctx.members.prop(function.owner, name);
    }
    return prop != null && prop.owner == function.owner && prop.field ? prop.name : null;
  }
}
