package nitpicker.kotlinpsi.design.walk;

import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import nitpicker.kotlinpsi.design.Ctx;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.model.Owner;
import nitpicker.kotlinpsi.design.model.Prop;
import nitpicker.kotlinpsi.design.model.Source;
import nitpicker.kotlinpsi.design.model.Ty;
import nitpicker.kotlinpsi.design.resolve.Arity;
import nitpicker.kotlinpsi.design.resolve.Binding;
import nitpicker.kotlinpsi.design.resolve.CallResolver;
import nitpicker.kotlinpsi.design.syntax.Conditions;
import nitpicker.kotlinpsi.design.syntax.Ps;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

public final class Walk {

  public final List<Object> calls = new ArrayList<>();
  public final Set<String> own = new LinkedHashSet<>();
  public final Set<String> references = new LinkedHashSet<>();
  public final Reads reads = new Reads();
  public final Uses uses;
  private final Ctx ctx;
  private final Fun function;
  private final Source source;
  private final Keys keys;
  private final Mutations mutations;
  private final Scope scope;
  private int finallyDepth;

  public Walk(Ctx ctx, Fun function) {
    this.ctx = ctx;
    this.function = function;
    this.source = function.owner.source;
    this.uses = new Uses(ctx, function);
    this.mutations = new Mutations(ctx, function);
    this.scope = new Scope(ctx, function);
    this.keys = new Keys(ctx, function, mutations);
  }

  public void run() {
    if (function.constructor() && function.owner.psi != null && function.psi == function.owner.psi) {
      declared();
    }
    for (PsiElement root : function.roots) {
      visit(root);
    }
  }

  private void declared() {
    for (int i = 0; i < function.params.size(); i++) {
      KtParameter parameter = function.params.get(i);
      if (!parameter.hasValOrVar()) {
        continue;
      }
      own.add(parameter.getName());
      if (uses.tracked(i)) {
        uses.opaque(i);
      }
    }
    for (Prop prop : function.owner.props.values()) {
      if (prop.field && !prop.constructorParameter && (prop.init != null || prop.delegated)) {
        own.add(prop.name);
      }
    }
  }

  private void visit(PsiElement element) {
    if (element == null || element instanceof KtTypeReference || element instanceof KtAnnotationEntry) {
      return;
    }
    if (element instanceof KtQualifiedExpression) {
      qualified((KtQualifiedExpression) element);
    } else if (element instanceof KtCallExpression) {
      call((KtCallExpression) element, null);
    } else if (element instanceof KtNameReferenceExpression) {
      bare((KtNameReferenceExpression) element, false);
    } else if (element instanceof KtTryExpression) {
      tryExpression((KtTryExpression) element);
    } else if (element instanceof KtCallableReferenceExpression) {
      reference((KtCallableReferenceExpression) element);
    } else if (element instanceof KtSuperTypeCallEntry) {
      KtSuperTypeCallEntry entry = (KtSuperTypeCallEntry) element;
      delegation(entry.getTypeReference(), entry.getValueArguments());
    } else if (element instanceof KtConstructorDelegationCall) {
      selfDelegation((KtConstructorDelegationCall) element);
    } else {
      for (PsiElement child : element.getChildren()) {
        visit(child);
      }
    }
  }

  private void reference(KtCallableReferenceExpression expression) {
    Fun target = ctx.references.function(expression);
    if (target != null && target.owner.listed && target != function) {
      references.add(target.id);
    }
    visit(expression.getReceiverExpression());
  }

  private void table(Prop prop) {
    for (Fun target : ctx.references.table(prop)) {
      if (target != function) {
        references.add(target.id);
      }
    }
  }

  private void tryExpression(KtTryExpression expression) {
    visit(expression.getTryBlock());
    for (KtCatchClause clause : expression.getCatchClauses()) {
      visit(clause.getCatchBody());
    }
    if (expression.getFinallyBlock() != null) {
      finallyDepth++;
      visit(expression.getFinallyBlock().getFinalExpression());
      finallyDepth--;
    }
  }

  private void delegation(KtTypeReference reference, List<? extends ValueArgument> arguments) {
    Ty type = ctx.names.resolve(reference, source);
    List<Arity.Arg> args = new ArrayList<>();
    for (ValueArgument argument : arguments) {
      String name = argument.getArgumentName() == null ? null : argument.getArgumentName().getAsName().asString();
      args.add(new Arity.Arg(name, argument instanceof KtLambdaArgument, argument.getArgumentExpression()));
    }
    Fun target = type.project() ? ctx.calls.constructor(type.owner, args).target : null;
    arguments(arguments, args, target);
  }

  private void selfDelegation(KtConstructorDelegationCall call) {
    Owner owner = function.owner;
    List<Arity.Arg> args = new ArrayList<>();
    for (ValueArgument argument : call.getValueArguments()) {
      String name = argument.getArgumentName() == null ? null : argument.getArgumentName().getAsName().asString();
      args.add(new Arity.Arg(name, argument instanceof KtLambdaArgument, argument.getArgumentExpression()));
    }
    Fun target = call.isCallToThis() ? ctx.calls.constructor(owner, args).target : null;
    arguments(call.getValueArguments(), args, target);
  }

  private void qualified(KtQualifiedExpression q) {
    KtExpression receiver = q.getReceiverExpression();
    KtExpression selector = q.getSelectorExpression();
    if (ctx.typer.staticOwner(receiver) == null) {
      KtExpression plain = Ps.parens(receiver);
      if (plain instanceof KtNameReferenceExpression) {
        bare((KtNameReferenceExpression) plain, true);
      } else {
        visit(receiver);
      }
    }
    if (selector instanceof KtCallExpression) {
      call((KtCallExpression) selector, receiver);
    } else if (selector instanceof KtNameReferenceExpression) {
      member(q, receiver, (KtNameReferenceExpression) selector);
    } else {
      visit(selector);
    }
  }

  private void member(KtQualifiedExpression q, KtExpression receiver, KtNameReferenceExpression selector) {
    String name = selector.getReferencedName();
    Owner staticOwner = ctx.typer.staticOwner(receiver);
    if (staticOwner != null) {
      Owner holder = ctx.typer.objectOwner(staticOwner);
      Prop prop = holder == null ? null : ctx.members.prop(holder, name);
      if (prop != null && prop.getter != null && holder != function.owner) {
        accessor(prop.getter, null, q);
      }
      if (prop != null) {
        table(prop);
      }
      return;
    }
    Ty type = ctx.typer.typeOf(receiver);
    Prop prop = type.project() ? ctx.members.prop(type.owner, name) : null;
    Scope.Value value = scope.value(receiver);
    if (value != null && value.param >= 0 && uses.tracked(value.param)) {
      if (scope.escapes(q) || prop == null && !(type.project() && ctx.members.hasMember(type.owner, name))) {
        uses.opaque(value.param);
      } else {
        uses.field(value.param, name);
      }
    }
    if (prop == null) {
      return;
    }
    if (value != null && value.type.project()) {
      reads.record(value.id, value.type.owner, new Reads.Access(name, Conditions.decided(q), source.line(selector)));
    }
    if (scope.thisField(receiver) != null && prop.owner == function.owner) {
      own.add(name);
    } else if (prop.getter != null) {
      accessor(prop.getter, receiver, q);
    }
  }

  private void accessor(Fun getter, KtExpression receiver, KtQualifiedExpression value) {
    String key = receiver == null ? null : keys.of(receiver);
    calls.add(
        m(
            "target", getter.id, "line", source.line(value.getSelectorExpression()), "receiver", key,
            "cleanup", finallyDepth > 0 ? Boolean.TRUE : null, "mutation", mutations.of(value)));
  }

  private void bare(KtNameReferenceExpression ref, boolean asReceiver) {
    Binding binding = ctx.bindings.bind(ref);
    if (binding.kind == Binding.Kind.LOCAL) {
      int index = scope.paramIndex(binding.declaration);
      if (!asReceiver && index >= 0 && uses.tracked(index) && (scope.escapes(ref) || !scope.neutral(ref))) {
        uses.opaque(index);
      }
    } else if (binding.kind == Binding.Kind.FIELD) {
      if (!binding.receiver) {
        table(binding.prop);
      }
      if (binding.receiver && function.receiver != null) {
        Ty receiver = ctx.names.resolve(function.receiver, source);
        reads.record(
            function, receiver.owner, new Reads.Access(binding.prop.name, Conditions.decided(ref), source.line(ref)));
      } else if (binding.prop.owner == function.owner) {
        own.add(binding.prop.name);
      }
    }
  }

  private void call(KtCallExpression call, KtExpression receiver) {
    String name = Ps.name(call);
    if (name == null) {
      for (PsiElement child : call.getChildren()) {
        visit(child);
      }
      return;
    }
    CallResolver.Resolved resolved = ctx.calls.resolve(call);
    boolean typed = receiver != null && ctx.typer.staticOwner(receiver) == null;
    Scope.Value value = typed ? scope.value(receiver) : null;
    if (value != null && value.param >= 0 && uses.tracked(value.param)) {
      boolean member = value.type.project() && ctx.members.hasMember(value.type.owner, name);
      if (scope.escapes(call) || !member) {
        uses.opaque(value.param);
      } else {
        uses.field(value.param, name);
      }
    }
    arguments(call.getValueArguments(), Arity.args(call), resolved.target);
    if ("use".equals(name) && typed) {
      closeAfterUse(receiver, call);
    }
    if (resolved.target != null) {
      String key = receiver == null ? (resolved.viaThis ? "this" : null) : typed ? keys.of(receiver) : null;
      calls.add(
          m(
              "target", resolved.target.id, "line", source.line(call.getCalleeExpression()), "receiver", key,
              "cleanup", finallyDepth > 0 ? Boolean.TRUE : null,
              "mutation", resolved.target.constructor() ? null : mutations.of(Ps.selectorCall(call))));
    }
  }

  private void closeAfterUse(KtExpression receiver, KtCallExpression call) {
    Ty type = ctx.typer.typeOf(receiver);
    Fun close = type.project() ? ctx.members.close(type.owner) : null;
    if (close != null) {
      calls.add(m("target", close.id, "line", source.line(call.getCalleeExpression()), "receiver", keys.of(receiver),
          "cleanup", Boolean.TRUE));
    }
  }

  private void arguments(List<? extends ValueArgument> arguments, List<Arity.Arg> args, Fun target) {
    int[] mapping = target == null ? null : Arity.bind(target.params, args);
    for (int i = 0; i < arguments.size(); i++) {
      KtExpression expression = Ps.parens(arguments.get(i).getArgumentExpression());
      int index = -1;
      if (expression instanceof KtNameReferenceExpression) {
        index = scope.parameterOf((KtNameReferenceExpression) expression);
      }
      if (index < 0 || !uses.tracked(index)) {
        visit(expression);
      } else if (scope.escapes(expression) || mapping == null || arguments.get(i).getSpreadElement() != null) {
        uses.opaque(index);
      } else {
        uses.forward(index, target.id, mapping[i]);
      }
    }
  }

}
