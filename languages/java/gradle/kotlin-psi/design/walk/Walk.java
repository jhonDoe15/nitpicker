package nitpicker.kotlinpsi.design.walk;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.kotlinpsi.design.Ctx;
import nitpicker.kotlinpsi.design.collect.Branches;
import nitpicker.kotlinpsi.design.collect.Reads;
import nitpicker.kotlinpsi.design.collect.Uses;
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
  public final List<Object> calls;
  public final Set<String> own = new LinkedHashSet<>();
  public final Set<String> references = new LinkedHashSet<>();
  public final Reads reads = new Reads();
  public final Uses uses;
  private final Ctx ctx;
  private final Fun function;
  private final Source source;
  private final Scope scope;
  private final Recorder recorder;
  private final Arguments arguments;
  private final Set<String> opaque = new LinkedHashSet<>();

  public Walk(Ctx ctx, Fun function) {
    this.ctx = ctx;
    this.function = function;
    this.source = function.owner.source;
    this.uses = new Uses(ctx, function);
    this.scope = new Scope(ctx, function);
    this.recorder = new Recorder(ctx, function);
    this.calls = recorder.calls;
    this.arguments = new Arguments(scope, uses, this::visit);
  }

  public void run() {
    if (function.constructor() && function.owner.psi != null && function.psi == function.owner.psi) {
      declared();
    }
    for (PsiElement root : function.roots) {
      visit(root);
    }
    calls.removeIf(call -> opaque.contains(((Map<?, ?>) call).get("receiver")));
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
    } else if (element instanceof KtLambdaExpression) {
      lambda((KtLambdaExpression) element);
    } else {
      other(element);
    }
  }

  private void other(PsiElement element) {
    if (element instanceof KtCallableReferenceExpression) {
      reference((KtCallableReferenceExpression) element);
    } else if (element instanceof KtSuperTypeCallEntry) {
      KtSuperTypeCallEntry entry = (KtSuperTypeCallEntry) element;
      delegation(ctx.names.resolve(entry.getTypeReference(), source), entry.getValueArguments());
    } else if (element instanceof KtConstructorDelegationCall) {
      selfDelegation((KtConstructorDelegationCall) element);
    } else if (Branches.conditional(element)) {
      recorder.branches.visit(element, this::visit);
    } else {
      children(element);
    }
  }

  private void children(PsiElement element) {
    for (PsiElement child : element.getChildren()) {
      visit(child);
    }
  }

  private void lambda(KtLambdaExpression lambda) {
    int outer = ctx.lambdas.transparent(lambda) ? -1 : recorder.suspendFinally();
    children(lambda);
    if (outer >= 0) {
      recorder.resumeFinally(outer);
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
      recorder.enterFinally();
      visit(expression.getFinallyBlock().getFinalExpression());
      recorder.leaveFinally();
    }
  }

  private void delegation(Ty type, List<? extends ValueArgument> values) {
    List<Arity.Arg> args = Arguments.args(values);
    Fun target = type.project() ? ctx.calls.constructor(type.owner, args).target : null;
    arguments.forward(values, args, target);
  }

  private void selfDelegation(KtConstructorDelegationCall call) {
    delegation(call.isCallToThis() ? Ty.of(function.owner) : Ty.UNKNOWN, call.getValueArguments());
  }

  private void qualified(KtQualifiedExpression q) {
    KtExpression receiver = q.getReceiverExpression();
    KtExpression selector = q.getSelectorExpression();
    if (ctx.typer.staticOwner(receiver) == null) {
      receiver(receiver);
    }
    if (selector instanceof KtCallExpression) {
      call((KtCallExpression) selector, receiver);
    } else if (selector instanceof KtNameReferenceExpression) {
      member(q, receiver, (KtNameReferenceExpression) selector);
    } else {
      visit(selector);
    }
  }

  private void receiver(KtExpression receiver) {
    KtExpression plain = Ps.parens(receiver);
    if (plain instanceof KtNameReferenceExpression) {
      bare((KtNameReferenceExpression) plain, true);
    } else {
      visit(receiver);
    }
  }

  private void staticMember(KtQualifiedExpression q, Owner staticOwner, String name) {
    Owner holder = ctx.typer.objectOwner(staticOwner);
    Prop prop = holder == null ? null : ctx.members.prop(holder, name);
    if (prop != null && prop.getter != null && holder != function.owner) {
      recorder.accessor(prop.getter, null, q);
    }
    if (prop != null) {
      table(prop);
    }
  }

  private void member(KtQualifiedExpression q, KtExpression receiver, KtNameReferenceExpression selector) {
    String name = selector.getReferencedName();
    Owner staticOwner = ctx.typer.staticOwner(receiver);
    if (staticOwner != null) {
      staticMember(q, staticOwner, name);
      return;
    }
    Ty type = ctx.typer.typeOf(receiver);
    Prop prop = type.project() ? ctx.members.prop(type.owner, name) : null;
    Scope.Value value = scope.value(receiver);
    boolean known = prop != null || type.project() && ctx.members.hasMember(type.owner, name);
    use(value, q, known ? name : null);
    if (prop != null) {
      fieldAccess(q, value, prop);
    }
  }

  private void track(KtCallExpression call, String name, KtExpression receiver) {
    Scope.Value value = receiver == null ? null : scope.value(receiver);
    boolean member = value != null && value.type.project() && ctx.members.hasMember(value.type.owner, name);
    use(value, call, member ? name : null);
  }

  private void use(Scope.Value value, KtExpression at, String field) {
    if (value == null || value.param < 0 || !uses.tracked(value.param)) {
      return;
    }
    if (scope.escapes(at) || field == null) {
      uses.opaque(value.param);
    } else {
      uses.field(value.param, field);
    }
  }

  private void fieldAccess(KtQualifiedExpression q, Scope.Value value, Prop prop) {
    KtExpression receiver = q.getReceiverExpression();
    KtExpression selector = q.getSelectorExpression();
    if (value != null && value.type.project()) {
      Reads.Access access = new Reads.Access(prop.name, Conditions.decided(q), source.line(selector));
      reads.record(value.id, value.type.owner, access);
    }
    if (scope.thisField(receiver) != null && prop.owner == function.owner) {
      own.add(prop.name);
    } else if (prop.getter != null) {
      recorder.accessor(prop.getter, receiver, q);
    }
  }

  private void bare(KtNameReferenceExpression ref, boolean asReceiver) {
    Binding binding = ctx.bindings.bind(ref);
    if (binding.kind == Binding.Kind.LOCAL) {
      int index = scope.paramIndex(binding.declaration);
      if (!asReceiver && index >= 0 && uses.tracked(index) && (scope.escapes(ref) || !scope.neutral(ref))) {
        uses.opaque(index);
      }
    } else if (binding.kind == Binding.Kind.FIELD) {
      field(ref, binding);
    }
  }

  private void field(KtNameReferenceExpression ref, Binding binding) {
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

  private void call(KtCallExpression call, KtExpression receiver) {
    String name = Ps.name(call);
    if (name == null) {
      children(call);
      return;
    }
    CallResolver.Resolved resolved = ctx.calls.resolve(call);
    boolean typed = receiver != null && ctx.typer.staticOwner(receiver) == null;
    track(call, name, typed ? receiver : null);
    arguments.forward(call.getValueArguments(), Arity.args(call), resolved.target);
    if ("use".equals(name) && typed) {
      recorder.closeAfterUse(receiver, call);
    }
    String hidden = recorder.hiddenKey(resolved);
    if (hidden != null) {
      opaque.add(hidden);
    }
    if (resolved.target != null) {
      recorder.call(call, resolved, recorder.keyOf(receiver, typed, resolved));
    }
  }
}
