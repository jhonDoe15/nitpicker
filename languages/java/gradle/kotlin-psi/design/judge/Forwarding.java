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
    Body single = declaration.hasBlockBody()
        ? blockBody(declaration, (KtBlockExpression) body)
        : new Body(Ps.parens(body), true);
    return single == null ? null : forward(ctx, function, single);
  }

  private static Body blockBody(KtNamedFunction declaration, KtBlockExpression block) {
    List<KtExpression> statements = block.getStatements();
    if (statements.size() != 1) {
      return null;
    }
    KtExpression only = statements.get(0);
    if (only instanceof KtReturnExpression) {
      return new Body(Ps.parens(((KtReturnExpression) only).getReturnedExpression()), true);
    }
    return returnsUnit(declaration) ? new Body(Ps.parens(only), false) : null;
  }

  private static boolean returnsUnit(KtNamedFunction declaration) {
    String declared = Ps.typeText(declaration.getTypeReference());
    return declared == null || declared.equals("Unit");
  }

  private record Body(KtExpression expression, boolean returned) {}

  private static Map<String, Object> forward(Ctx ctx, Fun function, Body body) {
    KtCallExpression call = callOf(body.expression());
    Fun target = call == null ? null : ctx.calls.target(call);
    if (target == null || target == function) {
      return null;
    }
    List<Object> arguments = arguments(ctx, function, call);
    return arguments == null ? null : m("target", target.id, "arguments", arguments, "returned", body.returned());
  }

  private static KtCallExpression callOf(KtExpression expression) {
    if (expression instanceof KtCallExpression) {
      return (KtCallExpression) expression;
    }
    if (!(expression instanceof KtDotQualifiedExpression)) {
      return null;
    }
    KtDotQualifiedExpression dot = (KtDotQualifiedExpression) expression;
    boolean plain = dot.getSelectorExpression() instanceof KtCallExpression
        && plainReceiver(dot.getReceiverExpression());
    return plain ? (KtCallExpression) dot.getSelectorExpression() : null;
  }

  private static List<Object> arguments(Ctx ctx, Fun function, KtCallExpression call) {
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
    return arguments.isEmpty() || passes ? arguments : null;
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
    while (e instanceof KtDotQualifiedExpression
        && ((KtDotQualifiedExpression) e).getSelectorExpression() instanceof KtNameReferenceExpression) {
      e = Ps.parens(((KtDotQualifiedExpression) e).getReceiverExpression());
    }
    return e instanceof KtThisExpression || e instanceof KtNameReferenceExpression;
  }
}
