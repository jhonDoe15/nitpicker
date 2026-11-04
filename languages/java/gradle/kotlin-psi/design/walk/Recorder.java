package nitpicker.kotlinpsi.design.walk;

import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.List;
import nitpicker.kotlinpsi.design.Ctx;
import nitpicker.kotlinpsi.design.collect.Branches;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.model.Source;
import nitpicker.kotlinpsi.design.model.Ty;
import nitpicker.kotlinpsi.design.resolve.CallResolver;
import nitpicker.kotlinpsi.design.syntax.Ps;
import org.jetbrains.kotlin.psi.*;

final class Recorder {
  final List<Object> calls = new ArrayList<>();
  final Keys keys;
  final Branches branches = new Branches();
  private final Ctx ctx;
  private final Source source;
  private final Mutations mutations;
  private int finallyDepth;

  Recorder(Ctx ctx, Fun function) {
    this.ctx = ctx;
    this.source = function.owner.source;
    this.mutations = new Mutations(ctx, function);
    this.keys = new Keys(ctx, function, mutations);
  }

  void enterFinally() {
    finallyDepth++;
  }

  void leaveFinally() {
    finallyDepth--;
  }

  int suspendFinally() {
    int before = finallyDepth;
    finallyDepth = 0;
    return before;
  }

  void resumeFinally(int depth) {
    finallyDepth = depth;
  }

  String keyOf(KtExpression receiver, boolean typed, CallResolver.Resolved resolved) {
    if (typed) {
      return keys.of(receiver);
    }
    if (receiver != null) {
      return null;
    }
    if (resolved.implicit != null) {
      return keys.of(resolved.implicit.receiver());
    }
    return resolved.viaThis ? "this" : null;
  }

  String hiddenKey(CallResolver.Resolved resolved) {
    boolean hidden = resolved.implicit != null && resolved.implicit.opaque();
    return hidden ? keys.of(resolved.implicit.receiver()) : null;
  }

  void accessor(Fun getter, KtExpression receiver, KtQualifiedExpression value) {
    String key = receiver == null ? null : keys.of(receiver);
    calls.add(
        m(
            "target", getter.id, "line", source.line(value.getSelectorExpression()), "receiver", key,
            "cleanup", cleanup(), "branch", branches.active(), "mutation", mutations.of(value)));
  }

  void call(KtCallExpression call, CallResolver.Resolved resolved, String key) {
    Fun target = resolved.target;
    calls.add(
        m(
            "target", target.id, "line", source.line(call.getCalleeExpression()), "receiver", key,
            "cleanup", cleanup(), "branch", branches.active(),
            "mutation", target.constructor() ? null : mutations.of(Ps.selectorCall(call))));
  }

  void closeAfterUse(KtExpression receiver, KtCallExpression call) {
    Ty type = ctx.typer.typeOf(receiver);
    Fun close = type.project() ? ctx.members.close(type.owner) : null;
    if (close != null) {
      calls.add(m("target", close.id, "line", source.line(call.getCalleeExpression()), "receiver", keys.of(receiver),
          "cleanup", Boolean.TRUE));
    }
  }

  private Boolean cleanup() {
    return finallyDepth > 0 ? Boolean.TRUE : null;
  }
}
