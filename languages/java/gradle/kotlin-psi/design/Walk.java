package nitpicker.kotlinpsi.design;

import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

final class Walk {
  private static final class Value {
    final Object id;
    final Ty type;
    final int param;

    Value(Object id, Ty type, int param) {
      this.id = id;
      this.type = type;
      this.param = param;
    }
  }

  final List<Object> calls = new ArrayList<>();
  final Set<String> own = new LinkedHashSet<>();
  final Reads reads = new Reads();
  final Uses uses;
  private final Ctx ctx;
  private final Fun function;
  private final Source source;
  private final Keys keys;
  private final Mutations mutations;
  private int finallyDepth;

  Walk(Ctx ctx, Fun function) {
    this.ctx = ctx;
    this.function = function;
    this.source = function.owner.source;
    this.uses = new Uses(ctx, function);
    this.mutations = new Mutations(ctx, function);
    this.keys = new Keys(ctx, function, mutations);
  }

  void run() {
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
      if (parameter.hasValOrVar()) {
        own.add(parameter.getName());
        if (uses.tracked(i)) {
          uses.opaque(i);
        }
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
      visit(((KtCallableReferenceExpression) element).getReceiverExpression());
    } else if (element instanceof KtSuperTypeCallEntry) {
      delegation(((KtSuperTypeCallEntry) element).getTypeReference(), ((KtSuperTypeCallEntry) element).getValueArguments());
    } else if (element instanceof KtConstructorDelegationCall) {
      selfDelegation((KtConstructorDelegationCall) element);
    } else {
      for (PsiElement child : element.getChildren()) {
        visit(child);
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
        accessor(prop.getter, null, q, selector);
      }
      return;
    }
    Ty type = ctx.typer.typeOf(receiver);
    Prop prop = type.project() ? ctx.members.prop(type.owner, name) : null;
    Value value = value(receiver);
    if (value != null && value.param >= 0 && uses.tracked(value.param)) {
      if (escapes(q) || prop == null && !(type.project() && ctx.members.hasMember(type.owner, name))) {
        uses.opaque(value.param);
      } else {
        uses.field(value.param, name);
      }
    }
    if (prop == null) {
      return;
    }
    if (value != null && value.type.project()) {
      reads.record(value.id, value.type.owner, name, Conditions.decided(q), source.line(selector));
    }
    if (thisField(receiver) != null && prop.owner == function.owner) {
      own.add(name);
    } else if (prop.getter != null) {
      accessor(prop.getter, receiver, q, selector);
    }
  }

  private void accessor(Fun getter, KtExpression receiver, KtExpression value, KtNameReferenceExpression node) {
    String key = receiver == null ? null : keys.of(receiver);
    calls.add(
        m(
            "target", getter.id, "line", source.line(node), "receiver", key,
            "cleanup", finallyDepth > 0 ? Boolean.TRUE : null, "mutation", mutations.of(value)));
  }

  private void bare(KtNameReferenceExpression ref, boolean asReceiver) {
    Binding binding = ctx.bindings.bind(ref);
    if (binding.kind == Binding.Kind.LOCAL) {
      int index = paramIndex(binding.declaration);
      if (!asReceiver && index >= 0 && uses.tracked(index) && (escapes(ref) || !neutral(ref))) {
        uses.opaque(index);
      }
    } else if (binding.kind == Binding.Kind.FIELD) {
      if (binding.receiver && function.receiver != null) {
        Ty receiver = ctx.names.resolve(function.receiver, source);
        reads.record(function, receiver.owner, binding.prop.name, Conditions.decided(ref), source.line(ref));
      } else if (binding.prop.owner == function.owner) {
        own.add(binding.prop.name);
      }
    }
  }

  private boolean neutral(KtNameReferenceExpression ref) {
    PsiElement parent = ref.getParent();
    while (parent instanceof KtParenthesizedExpression) {
      parent = parent.getParent();
    }
    if (parent instanceof KtIsExpression) {
      return true;
    }
    if (parent instanceof KtBinaryExpression) {
      KtBinaryExpression binary = (KtBinaryExpression) parent;
      Object token = binary.getOperationToken();
      boolean equality = token == KtTokens.EQEQ || token == KtTokens.EXCLEQ || token == KtTokens.EQEQEQ
          || token == KtTokens.EXCLEQEQEQ;
      KtExpression other = Ps.parens(binary.getLeft()) == ref ? binary.getRight() : binary.getLeft();
      return equality && Ps.parens(other) instanceof KtConstantExpression
          && Ps.parens(other).getNode().getElementType() == org.jetbrains.kotlin.KtNodeTypes.NULL;
    }
    return false;
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
    Value value = typed ? value(receiver) : null;
    if (value != null && value.param >= 0 && uses.tracked(value.param)) {
      boolean member = value.type.project() && ctx.members.hasMember(value.type.owner, name);
      if (escapes(call) || !member) {
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
      int index = expression instanceof KtNameReferenceExpression ? parameterOf((KtNameReferenceExpression) expression) : -1;
      if (index < 0 || !uses.tracked(index)) {
        visit(expression);
      } else if (escapes(expression) || mapping == null || arguments.get(i).getSpreadElement() != null) {
        uses.opaque(index);
      } else {
        uses.forward(index, target.id, mapping[i]);
      }
    }
  }

  private int parameterOf(KtNameReferenceExpression ref) {
    Binding binding = ctx.bindings.bind(ref);
    return binding.kind == Binding.Kind.LOCAL ? paramIndex(binding.declaration) : -1;
  }

  private int paramIndex(PsiElement declaration) {
    for (int i = 0; i < function.params.size(); i++) {
      if (function.params.get(i) == declaration) {
        return i;
      }
    }
    return -1;
  }

  private Prop thisField(KtExpression expression) {
    KtExpression e = Ps.strip(expression);
    if (!(e instanceof KtDotQualifiedExpression)) {
      return null;
    }
    KtDotQualifiedExpression q = (KtDotQualifiedExpression) e;
    KtExpression receiver = Ps.strip(q.getReceiverExpression());
    if (receiver instanceof KtThisExpression && q.getSelectorExpression() instanceof KtNameReferenceExpression
        && ctx.typer.typeOf(receiver).owner == function.owner && !function.owner.module()) {
      return ctx.members.prop(function.owner, ((KtNameReferenceExpression) q.getSelectorExpression()).getReferencedName());
    }
    return null;
  }

  private Value value(KtExpression expression) {
    KtExpression e = Ps.strip(expression);
    if (e instanceof KtNameReferenceExpression) {
      Binding binding = ctx.bindings.bind((KtNameReferenceExpression) e);
      if (binding.kind == Binding.Kind.LOCAL) {
        return new Value(binding.declaration, ctx.typer.localType(binding.declaration), paramIndex(binding.declaration));
      }
      if (binding.kind == Binding.Kind.FIELD && !binding.receiver) {
        return new Value(binding.prop, ctx.typer.propType(binding.prop), -1);
      }
      return null;
    }
    Prop prop = thisField(e);
    return prop == null ? null : new Value(prop, ctx.typer.propType(prop), -1);
  }

  private boolean escapes(PsiElement node) {
    for (PsiElement p = node.getParent(); p != null && p != function.psi; p = p.getParent()) {
      if (p instanceof KtLambdaExpression && !ctx.lambdas.transparent((KtLambdaExpression) p)
          || p instanceof KtObjectLiteralExpression || p instanceof KtNamedFunction
          || p instanceof KtClassOrObject && ctx.index.byPsi.get(p) == null) {
        return true;
      }
    }
    return false;
  }
}
