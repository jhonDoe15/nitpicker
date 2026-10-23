package nitpicker.kotlinpsi.design.judge;

import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import nitpicker.kotlinpsi.design.Ctx;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.resolve.Binding;
import nitpicker.kotlinpsi.design.syntax.Ps;
import org.jetbrains.kotlin.psi.*;

public final class Forwarding {
  private Forwarding() {}

  public static Map<String, Object> of(Ctx ctx, Fun function) {
    if (!(function.psi instanceof KtNamedFunction) || function.property != null) {
      return null;
    }
    KtNamedFunction declaration = (KtNamedFunction) function.psi;
    KtExpression body = declaration.getBodyExpression();
    if (body == null) {
      return null;
    }
    KtExpression expression = body;
    boolean returned = true;
    if (declaration.hasBlockBody()) {
      List<KtExpression> statements = ((KtBlockExpression) body).getStatements();
      KtExpression only = statements.size() == 1 ? statements.get(0) : null;
      if (only == null) {
        return null;
      }
      returned = only instanceof KtReturnExpression;
      expression = returned ? ((KtReturnExpression) only).getReturnedExpression() : only;
      if (!returned && !returnsUnit(declaration)) {
        return null;
      }
    }
    return forward(ctx, function, new Body(Ps.parens(expression), returned));
  }

  private static boolean returnsUnit(KtNamedFunction declaration) {
    String declared = Ps.typeText(declaration.getTypeReference());
    return declared == null || declared.equals("Unit");
  }

  private record Body(KtExpression expression, boolean returned) {}

  private static Map<String, Object> forward(Ctx ctx, Fun function, Body body) {
    KtExpression expression = body.expression();
    KtCallExpression call;
    if (expression instanceof KtDotQualifiedExpression
        && ((KtDotQualifiedExpression) expression).getSelectorExpression() instanceof KtCallExpression
        && plainReceiver(((KtDotQualifiedExpression) expression).getReceiverExpression())) {
      call = (KtCallExpression) ((KtDotQualifiedExpression) expression).getSelectorExpression();
    } else if (expression instanceof KtCallExpression) {
      call = (KtCallExpression) expression;
    } else {
      return null;
    }
    Fun target = ctx.calls.target(call);
    if (target == null || target == function) {
      return null;
    }
    List<Object> arguments = new ArrayList<>();
    boolean passes = false;
    for (ValueArgument argument : call.getValueArguments()) {
      if (argument.getArgumentName() != null || argument.getSpreadElement() != null) {
        return null;
      }
      int index = parameter(ctx, function, argument.getArgumentExpression());
      passes |= index >= 0;
      arguments.add(index);
    }
    if (!arguments.isEmpty() && !passes) {
      return null;
    }
    return m("target", target.id, "arguments", arguments, "returned", body.returned());
  }

  private static int parameter(Ctx ctx, Fun function, KtExpression expression) {
    KtExpression e = Ps.parens(expression);
    if (!(e instanceof KtNameReferenceExpression)) {
      return -1;
    }
    Binding binding = ctx.bindings.bind((KtNameReferenceExpression) e);
    if (binding.kind != Binding.Kind.LOCAL) {
      return -1;
    }
    for (int i = 0; i < function.params.size(); i++) {
      if (function.params.get(i) == binding.declaration) {
        return i;
      }
    }
    return -1;
  }

  private static boolean plainReceiver(KtExpression expression) {
    KtExpression e = Ps.parens(expression);
    if (e instanceof KtThisExpression || e instanceof KtNameReferenceExpression) {
      return true;
    }
    return e instanceof KtDotQualifiedExpression
        && ((KtDotQualifiedExpression) e).getSelectorExpression() instanceof KtNameReferenceExpression
        && plainReceiver(((KtDotQualifiedExpression) e).getReceiverExpression());
  }
}
